import { DatePipe } from '@angular/common';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { PaymentStatus } from '../../../core/models';
import { ToastService } from '../../../core/toast.service';
import { Paginated, PaymentListItem } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { onAdminEvents } from '../../core/admin-socket.service';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '../../core/labels';
import { ReceiptView } from '../../shared/receipt-view';

@Component({
  selector: 'app-payments-page',
  imports: [CopPipe, DatePipe, ReceiptView],
  templateUrl: './payments-page.html',
  styleUrl: './payments-page.scss',
})
export class PaymentsPage {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly methodLabel = PAYMENT_METHOD;
  protected readonly statusLabel = PAYMENT_STATUS;
  protected readonly tabs: { value: PaymentStatus; label: string }[] = [
    { value: 'PENDING_REVIEW', label: 'Por revisar' },
    { value: 'APPROVED', label: 'Aprobados' },
    { value: 'REJECTED', label: 'Rechazados' },
  ];
  protected readonly rejectReasons = [
    'El monto no coincide con el total',
    'El comprobante no es legible',
    'No vemos el pago reflejado en la cuenta',
    'El comprobante ya fue usado en otro pedido',
  ];

  protected readonly status = signal<PaymentStatus>('PENDING_REVIEW');
  protected readonly page = signal(1);
  protected readonly result = signal<Paginated<PaymentListItem> | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly newArrivals = signal(0);

  protected readonly rejecting = signal<PaymentListItem | null>(null);
  protected readonly rejectReason = signal('');
  private readonly rejectDialog = viewChild<ElementRef<HTMLDialogElement>>('rejectDialog');

  constructor() {
    this.load();
    onAdminEvents(() => {
      // No recargar bajo el cursor del admin: avisar y dejar que recargue cuando quiera,
      // salvo que la cola esté vacía.
      if (this.status() !== 'PENDING_REVIEW') return;
      if ((this.result()?.data.length ?? 0) === 0) this.load();
      else this.newArrivals.update((n) => n + 1);
    }, ['payment.submitted']);
  }

  protected setStatus(status: PaymentStatus): void {
    this.status.set(status);
    this.page.set(1);
    this.load();
  }

  protected load(): void {
    this.newArrivals.set(0);
    this.loadError.set(null);
    this.api.payments(this.status(), this.page()).subscribe({
      next: (r) => this.result.set(r),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected approve(p: PaymentListItem): void {
    this.busy.set(p.id);
    this.api.approvePayment(p.id).subscribe({
      next: () => {
        this.toast.show(`✅ ${p.order.code} aprobado`, 'success', 2500);
        this.removeFromList(p.id);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.show(errorMessage(err), 'warn', 6000);
        this.load();
      },
    });
  }

  protected openReject(p: PaymentListItem): void {
    this.rejecting.set(p);
    this.rejectReason.set('');
    this.rejectDialog()?.nativeElement.showModal();
  }

  protected closeReject(): void {
    this.rejectDialog()?.nativeElement.close();
    this.rejecting.set(null);
  }

  protected confirmReject(): void {
    const p = this.rejecting();
    const reason = this.rejectReason().trim();
    if (!p || reason.length < 3) return;
    this.busy.set(p.id);
    this.closeReject();
    this.api.rejectPayment(p.id, reason).subscribe({
      next: () => {
        this.toast.show(`${p.order.code} rechazado; el cliente puede reenviar el comprobante`, 'info', 3500);
        this.removeFromList(p.id);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.show(errorMessage(err), 'warn', 6000);
        this.load();
      },
    });
  }

  private removeFromList(id: string): void {
    this.busy.set(null);
    this.result.update((r) => (r ? { ...r, data: r.data.filter((p) => p.id !== id), total: r.total - 1 } : r));
    if (this.result()?.data.length === 0 && (this.result()?.total ?? 0) > 0) this.load();
  }
}
