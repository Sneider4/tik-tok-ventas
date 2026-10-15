import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { ToastService } from '../../../core/toast.service';
import { ShipmentBatchDetail } from '../../core/admin-models';
import { AdminApiService, openPdf } from '../../core/admin-api.service';
import { onAdminEvents } from '../../core/admin-socket.service';
import { SHIPMENT_STATUS } from '../../core/labels';
import { BATCH_STATUS } from './batches-page';

@Component({
  selector: 'app-batch-detail-page',
  imports: [DatePipe, RouterLink, CopPipe],
  template: `
    @if (batch(); as b) {
      <header class="adm-head">
        <a class="topbar__back" routerLink="/admin/guias" aria-label="Volver a lotes">←</a>
        <h1>Lote del {{ b.createdAt | date: 'd MMM, h:mm a' }}</h1>
        <span class="badge" [class]="'badge ' + batchStatus[b.status].badge">{{ batchStatus[b.status].label }}</span>
      </header>

      <section class="card bd-summary">
        <div class="bd-progress" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
          <span class="bd-progress__ok" [style.width.%]="(b.succeeded / b.totalOrders) * 100"></span>
          <span class="bd-progress__fail" [style.width.%]="(b.failed / b.totalOrders) * 100"></span>
        </div>
        <p>
          <strong>{{ b.succeeded }}</strong> de {{ b.totalOrders }} guías listas
          @if (b.failed) {
            · <strong style="color: var(--danger)">{{ b.failed }} fallidas</strong>
          }
          · {{ b.provider }}
        </p>
        <div class="row">
          <button type="button" class="btn btn--primary" (click)="printAll()" [disabled]="!b.mergedLabelPath">
            🖨️ Imprimir todas ({{ b.succeeded }})
          </button>
          @if (failedOrderIds().length) {
            <button type="button" class="btn btn--outline" (click)="retryFailed()" [disabled]="retrying()">
              Reintentar fallidas ({{ failedOrderIds().length }})
            </button>
          }
        </div>
        @if (b.status === 'PROCESSING') {
          <p class="small muted">Generando guías… esta página se actualiza sola.</p>
        } @else {
          <p class="small muted">El PDF trae una guía de 10×15 cm por página, en orden de pedido. Imprímelo en la térmica a tamaño real (100%).</p>
        }
      </section>

      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Destinatario</th>
              <th>Estado</th>
              <th>Transportadora / guía</th>
              <th class="num">Costo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (s of b.shipments; track s.id) {
              <tr>
                <td class="strong">{{ s.order.code }}</td>
                <td>{{ s.order.shipFullName }}<div class="small muted">{{ s.order.shipCityName }}</div></td>
                <td>
                  <span class="badge" [class]="'badge ' + (shipmentStatus[s.status]?.badge ?? 'badge--muted')">{{ shipmentStatus[s.status]?.label ?? s.status }}</span>
                  @if (s.errorMessage) {
                    <div class="small" style="color: var(--danger); max-width: 280px">{{ s.errorMessage }}</div>
                  }
                </td>
                <td>{{ s.carrier ?? '—' }} @if (s.trackingNumber) { <div class="mono">{{ s.trackingNumber }}</div> }</td>
                <td class="num">{{ s.costCop != null ? (s.costCop | cop) : '—' }}</td>
                <td class="num">
                  @if (s.labelPath && s.status !== 'CANCELLED') {
                    <button type="button" class="btn btn--ghost btn--sm" (click)="printOne(s.id, s.order.code)">PDF</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="skeleton" style="height: 300px"></div>
    }
  `,
  styles: `
    .adm-head .topbar__back { flex: none; }
    .bd-summary { display: grid; gap: 12px; margin-bottom: 16px; }
    .bd-summary p { margin: 0; }
    .bd-progress { display: flex; height: 10px; border-radius: 999px; background: #f1e7ec; overflow: hidden; }
    .bd-progress span { transition: width .3s ease; }
    .bd-progress__ok { background: var(--success); }
    .bd-progress__fail { background: var(--danger); }
  `,
})
export class BatchDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly batchStatus = BATCH_STATUS;
  protected readonly shipmentStatus = SHIPMENT_STATUS;
  protected readonly batch = signal<ShipmentBatchDetail | null>(null);
  protected readonly retrying = signal(false);

  protected readonly progress = computed(() => {
    const b = this.batch();
    return b ? Math.round(((b.succeeded + b.failed) / b.totalOrders) * 100) : 0;
  });

  protected readonly failedOrderIds = computed(() =>
    (this.batch()?.shipments ?? []).filter((s) => s.status === 'FAILED' && s.order.status === 'PAID').map((s) => s.order.id),
  );

  private autoPrinted = false;

  constructor() {
    effect(() => this.load(this.id()));
    onAdminEvents((e) => {
      if (e.payload['batchId'] === this.id()) this.load(this.id());
    }, ['batch.updated']);
  }

  protected load(id: string): void {
    this.api.batch(id).subscribe({
      next: (b) => {
        const wasProcessing = this.batch()?.status === 'PROCESSING';
        this.batch.set(b);
        if (wasProcessing && b.status !== 'PROCESSING' && !this.autoPrinted) {
          this.autoPrinted = true;
          this.toast.show(`Lote listo: ${b.succeeded} guías${b.failed ? `, ${b.failed} fallidas` : ''}`, b.failed ? 'warn' : 'success', 5000);
        }
      },
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }

  protected printAll(): void {
    const b = this.batch();
    if (!b) return;
    this.api.batchLabels(b.id).subscribe({
      next: (blob) => openPdf(blob, `guias-${b.id.slice(0, 8)}.pdf`),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }

  protected printOne(shipmentId: string, code: string): void {
    this.api.shipmentLabel(shipmentId).subscribe({
      next: (blob) => openPdf(blob, `guia-${code}.pdf`),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }

  protected retryFailed(): void {
    this.retrying.set(true);
    this.api.createBatch(this.failedOrderIds()).subscribe({
      next: ({ batch }) => {
        this.retrying.set(false);
        void this.router.navigate(['/admin/guias', batch.id]);
      },
      error: (err) => {
        this.retrying.set(false);
        this.toast.show(errorMessage(err), 'warn', 6000);
      },
    });
  }
}
