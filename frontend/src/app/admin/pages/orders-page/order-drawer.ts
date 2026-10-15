import { DatePipe } from '@angular/common';
import { Component, effect, HostListener, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { ToastService } from '../../../core/toast.service';
import { OrderDetail } from '../../core/admin-models';
import { AdminApiService, openPdf } from '../../core/admin-api.service';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, SHIPMENT_STATUS } from '../../core/labels';
import { ReceiptView } from '../../shared/receipt-view';

@Component({
  selector: 'app-order-drawer',
  imports: [CopPipe, DatePipe, RouterLink, ReceiptView],
  templateUrl: './order-drawer.html',
  styleUrl: './order-drawer.scss',
})
export class OrderDrawer {
  readonly orderId = input.required<string>();
  readonly closed = output<void>();
  readonly changed = output<void>();

  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly statusLabel = ORDER_STATUS;
  protected readonly methodLabel = PAYMENT_METHOD;
  protected readonly paymentStatus = PAYMENT_STATUS;
  protected readonly shipmentStatus = SHIPMENT_STATUS;

  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly working = signal(false);
  protected readonly confirmingCancel = signal(false);
  protected readonly cancelReason = signal('');

  constructor() {
    effect(() => this.load(this.orderId()));
  }

  @HostListener('document:keydown.escape')
  protected close(): void {
    this.closed.emit();
  }

  protected load(id: string): void {
    this.api.order(id).subscribe({
      next: (o) => this.order.set(o),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }

  protected whatsapp(o: OrderDetail): string {
    const text = `Hola ${o.shipFullName.split(' ')[0]}, te escribimos por tu pedido ${o.code} 💄`;
    return `https://wa.me/57${o.shipPhone}?text=${encodeURIComponent(text)}`;
  }

  protected canCancel(o: OrderDetail): boolean {
    return ['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID'].includes(o.status);
  }

  protected cancel(): void {
    const o = this.order();
    if (!o) return;
    this.working.set(true);
    this.api.cancelOrder(o.id, this.cancelReason().trim() || undefined).subscribe({
      next: (updated) => {
        this.working.set(false);
        this.confirmingCancel.set(false);
        this.order.set(updated);
        this.toast.show(`${o.code} cancelado; el stock volvió al inventario`, 'success');
        this.changed.emit();
      },
      error: (err) => {
        this.working.set(false);
        this.toast.show(errorMessage(err), 'warn', 6000);
      },
    });
  }

  protected generateLabel(): void {
    const o = this.order();
    if (!o) return;
    this.working.set(true);
    this.api.createBatch([o.id]).subscribe({
      next: ({ batch }) => {
        this.working.set(false);
        void this.router.navigate(['/admin/guias', batch.id]);
      },
      error: (err) => {
        this.working.set(false);
        this.toast.show(errorMessage(err), 'warn', 6000);
      },
    });
  }

  protected downloadLabel(shipmentId: string, code: string): void {
    this.api.shipmentLabel(shipmentId).subscribe({
      next: (blob) => openPdf(blob, `guia-${code}.pdf`),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }
}
