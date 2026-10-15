import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { ToastService } from '../../../core/toast.service';
import { BatchStatus, ShipmentBatch } from '../../core/admin-models';
import { AdminApiService, openPdf } from '../../core/admin-api.service';
import { onAdminEvents } from '../../core/admin-socket.service';

export const BATCH_STATUS: Record<BatchStatus, { label: string; badge: string }> = {
  PROCESSING: { label: 'Generando…', badge: 'badge--warn' },
  COMPLETED: { label: 'Completo', badge: 'badge--success' },
  PARTIAL: { label: 'Con errores', badge: 'badge--warn' },
  FAILED: { label: 'Falló', badge: 'badge--danger' },
};

@Component({
  selector: 'app-batches-page',
  imports: [DatePipe, RouterLink],
  template: `
    <header class="adm-head">
      <h1>Lotes de guías</h1>
      <a class="btn btn--primary btn--sm" routerLink="/admin/pedidos" [queryParams]="{ estado: 'PAID' }">+ Generar guías</a>
    </header>

    @if (loadError()) {
      <div class="adm-empty">
        <p>{{ loadError() }}</p>
        <button type="button" class="btn btn--ghost btn--sm" (click)="load()">Reintentar</button>
      </div>
    } @else if (batches(); as list) {
      @if (list.length === 0) {
        <div class="adm-empty">
          Aún no hay lotes. Ve a <a routerLink="/admin/pedidos" [queryParams]="{ estado: 'PAID' }">Pedidos → Listos para guía</a>,
          selecciona los pedidos y toca “Generar guías”.
        </div>
      } @else {
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Estado</th>
                <th class="num">Pedidos</th>
                <th class="num">OK</th>
                <th class="num">Fallidas</th>
                <th>Creado por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (b of list; track b.id) {
                <tr>
                  <td><a [routerLink]="['/admin/guias', b.id]" class="strong">{{ b.createdAt | date: 'd MMM y, h:mm a' }}</a></td>
                  <td><span class="badge" [class]="'badge ' + statusLabel[b.status].badge">{{ statusLabel[b.status].label }}</span></td>
                  <td class="num">{{ b.totalOrders }}</td>
                  <td class="num">{{ b.succeeded }}</td>
                  <td class="num">{{ b.failed || '—' }}</td>
                  <td>{{ b.createdBy.fullName }}</td>
                  <td class="num">
                    @if (b.mergedLabelPath) {
                      <button type="button" class="btn btn--ghost btn--sm" (click)="print(b)">🖨️ PDF</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 240px"></div>
    }
  `,
})
export class BatchesPage {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly statusLabel = BATCH_STATUS;
  protected readonly batches = signal<ShipmentBatch[] | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    this.load();
    onAdminEvents((e) => {
      if (e.payload['done']) this.load();
    }, ['batch.updated']);
  }

  protected load(): void {
    this.loadError.set(null);
    this.api.batches().subscribe({
      next: (b) => this.batches.set(b),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  protected print(b: ShipmentBatch): void {
    this.api.batchLabels(b.id).subscribe({
      next: (blob) => openPdf(blob, `guias-${b.id.slice(0, 8)}.pdf`),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }
}
