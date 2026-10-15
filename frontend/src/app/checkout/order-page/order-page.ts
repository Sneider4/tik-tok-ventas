import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { CopPipe } from '../../core/cop.pipe';
import { compressReceipt } from '../../core/image-compress';
import { OrderStatus, PaymentMethod, PublicOrder } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const MAX_RECEIPT_MB = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** Estados en los que el pedido avanza solo (lo mueve la tienda): se refresca periódicamente. */
const POLLING_STATES: OrderStatus[] = ['PAYMENT_REVIEW', 'PAID', 'LABEL_GENERATED', 'SHIPPED'];

const STEPS: { status: OrderStatus[]; label: string; hint: string }[] = [
  { status: ['PENDING_PAYMENT'], label: 'Pedido apartado', hint: 'Envía tu comprobante de pago' },
  { status: ['PAYMENT_REVIEW'], label: 'Verificando pago', hint: 'Estamos revisando tu comprobante' },
  { status: ['PAID'], label: 'Pago confirmado', hint: 'Estamos alistando tu paquete' },
  { status: ['LABEL_GENERATED'], label: 'Guía generada', hint: 'Tu paquete está listo para salir' },
  { status: ['SHIPPED'], label: 'En camino', hint: 'La transportadora tiene tu paquete' },
  { status: ['DELIVERED'], label: 'Entregado', hint: '¡Disfrútalo! 💖' },
];

@Component({
  selector: 'app-order-page',
  imports: [CopPipe, DatePipe],
  templateUrl: './order-page.html',
  styleUrl: './order-page.scss',
})
export class OrderPage {
  /** Viene de la ruta /pedido/:token */
  readonly token = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly order = signal<PublicOrder | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  // Formulario de comprobante
  protected readonly method = signal<PaymentMethod | null>(null);
  protected readonly reference = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly progress = signal(0);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly methods: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'NEQUI', label: 'Nequi', icon: '💜' },
    { value: 'DAVIPLATA', label: 'Daviplata', icon: '❤️' },
    { value: 'BANK_TRANSFER', label: 'Transferencia', icon: '🏦' },
  ];

  /** Milisegundos que quedan de reserva (null si no aplica). */
  protected readonly remainingMs = computed(() => {
    const until = this.order()?.reservedUntil;
    return until ? Math.max(0, new Date(until).getTime() - this.now()) : null;
  });

  protected readonly countdown = computed(() => {
    const ms = this.remainingMs();
    if (ms === null) return '';
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  protected readonly steps = computed(() => {
    const status = this.order()?.status;
    const current = STEPS.findIndex((s) => status && s.status.includes(status));
    return STEPS.map((step, i) => ({ ...step, state: i < current ? 'done' : i === current ? 'current' : 'todo' }));
  });

  protected readonly paymentAccount = computed(() => {
    const payment = this.order()?.payment;
    switch (this.method()) {
      case 'NEQUI':
        return payment?.nequi ? { label: 'Número Nequi', value: payment.nequi } : null;
      case 'DAVIPLATA':
        return payment?.daviplata ? { label: 'Número Daviplata', value: payment.daviplata } : null;
      case 'BANK_TRANSFER':
        return payment?.bank ? { label: 'Cuenta', value: payment.bank } : null;
      default:
        return null;
    }
  });

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => this.load(this.token()));

    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      this.stopPolling();
      const url = this.preview();
      if (url) URL.revokeObjectURL(url);
    });
  }

  protected load(token: string, silent = false): void {
    if (!silent) this.error.set(null);
    this.api.getOrder(token).subscribe({
      next: (order) => {
        const previous = this.order()?.status;
        this.order.set(order);
        if (previous && previous !== order.status) this.toast.show(this.statusMessage(order.status), 'success');
        this.syncPolling(order.status);
      },
      error: (err) => {
        if (!silent) this.error.set(errorMessage(err));
      },
    });
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    this.uploadError.set(null);

    if (!ACCEPTED.includes(picked.type) && !/\.(heic|heif)$/i.test(picked.name)) {
      this.uploadError.set('Formato no permitido. Sube una foto (JPG, PNG) o un PDF.');
      return;
    }
    const file = await compressReceipt(picked);
    if (file.size > MAX_RECEIPT_MB * 1024 * 1024) {
      this.uploadError.set(`El archivo pesa más de ${MAX_RECEIPT_MB} MB. Prueba con una captura de pantalla.`);
      return;
    }

    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.file.set(file);
    this.preview.set(file.type.startsWith('image/') && file.type !== 'image/heic' ? URL.createObjectURL(file) : null);
  }

  protected removeFile(): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.file.set(null);
    this.preview.set(null);
  }

  protected upload(): void {
    const method = this.method();
    const file = this.file();
    if (!method) return this.uploadError.set('Elige cómo pagaste.');
    if (!file) return this.uploadError.set('Adjunta la captura o el PDF del comprobante.');

    this.uploading.set(true);
    this.progress.set(0);
    this.uploadError.set(null);

    this.api.submitPayment(this.token(), method, file, this.reference().trim() || undefined).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((event.loaded / event.total) * 100));
        } else if (event.type === HttpEventType.Response && event.body) {
          this.order.set(event.body);
          this.uploading.set(false);
          this.removeFile();
          this.syncPolling(event.body.status);
          this.toast.show('¡Comprobante recibido! Te avisaremos cuando lo verifiquemos.', 'success', 5000);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      },
      error: (err) => {
        this.uploading.set(false);
        this.uploadError.set(errorMessage(err));
        this.load(this.token(), true); // puede haber expirado mientras tanto
      },
    });
  }

  protected async copy(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.toast.show(`${label} copiado`, 'success', 2000);
    } catch {
      this.toast.show('No se pudo copiar; mantén presionado el texto para copiarlo', 'warn');
    }
  }

  protected copyLink(): void {
    void this.copy(location.href, 'Link');
  }

  private syncPolling(status: OrderStatus): void {
    if (POLLING_STATES.includes(status)) {
      if (!this.pollHandle) this.pollHandle = setInterval(() => this.load(this.token(), true), 20_000);
    } else {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = null;
  }

  private statusMessage(status: OrderStatus): string {
    const messages: Partial<Record<OrderStatus, string>> = {
      PAID: '¡Tu pago fue confirmado! 🎉',
      LABEL_GENERATED: 'Tu guía de envío está lista 📦',
      SHIPPED: 'Tu pedido va en camino 🚚',
      DELIVERED: 'Tu pedido fue entregado 💖',
      PENDING_PAYMENT: 'Necesitamos que revises tu comprobante',
      EXPIRED: 'La reserva de tu pedido venció',
      CANCELLED: 'Tu pedido fue cancelado',
    };
    return messages[status] ?? 'Tu pedido se actualizó';
  }
}
