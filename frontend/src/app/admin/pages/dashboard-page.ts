import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { CopPipe } from '../../core/cop.pipe';
import { ToastService } from '../../core/toast.service';
import { OrderStatus } from '../../core/models';
import { DashboardSummary } from '../core/admin-models';
import { AdminApiService } from '../core/admin-api.service';
import { onAdminEvents } from '../core/admin-socket.service';
import { AuthService } from '../core/auth.service';
import { ORDER_STATUS } from '../core/labels';

const PIPELINE: OrderStatus[] = ['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'LABEL_GENERATED', 'SHIPPED', 'DELIVERED'];

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CopPipe],
  template: `
    <header class="adm-head">
      <h1>Hola, {{ firstName() }} 👋</h1>
      <button type="button" class="btn btn--outline btn--sm" (click)="load()">Actualizar</button>
    </header>

    @if (summary(); as s) {
      <section class="adm-kpis">
        <div class="adm-kpi">
          <p class="muted small">Ventas confirmadas hoy</p>
          <p class="adm-kpi__value">{{ s.today.salesCop | cop }}</p>
          <p class="small muted">{{ s.today.ordersPaid }} pedidos pagados</p>
        </div>
        <div class="adm-kpi">
          <p class="muted small">Pedidos creados hoy</p>
          <p class="adm-kpi__value">{{ s.today.ordersCreated }}</p>
        </div>
        <a class="adm-kpi" [class.adm-kpi--alert]="s.pendingPayments > 0" routerLink="/admin/pagos">
          <p class="muted small">Comprobantes por revisar</p>
          <p class="adm-kpi__value">{{ s.pendingPayments }}</p>
          <p class="small strong" style="color: var(--brand-strong)">Revisar →</p>
        </a>
        <a class="adm-kpi" [class.adm-kpi--alert]="(s.ordersByStatus.PAID ?? 0) > 0" routerLink="/admin/pedidos" [queryParams]="{ estado: 'PAID' }">
          <p class="muted small">Listos para guía</p>
          <p class="adm-kpi__value">{{ s.ordersByStatus.PAID ?? 0 }}</p>
          <p class="small strong" style="color: var(--brand-strong)">Generar guías →</p>
        </a>
        <a class="adm-kpi" [class.adm-kpi--alert]="s.lowStockVariants > 0" routerLink="/admin/inventario" [queryParams]="{ bajo: 1 }">
          <p class="muted small">Productos con stock bajo</p>
          <p class="adm-kpi__value">{{ s.lowStockVariants }}</p>
        </a>
      </section>

      <section class="card">
        <h2 class="card__title">Pedidos por estado</h2>
        <div class="pipeline">
          @for (step of pipeline(); track step.status) {
            <a class="pipeline__step" routerLink="/admin/pedidos" [queryParams]="{ estado: step.status }">
              <span class="pipeline__count">{{ step.count }}</span>
              <span class="badge" [class]="'badge ' + step.badge">{{ step.label }}</span>
            </a>
          }
        </div>
        @if (closed() > 0) {
          <p class="small muted" style="margin: 12px 0 0">{{ closed() }} pedidos cancelados o expirados.</p>
        }
      </section>
    } @else {
      <div class="adm-kpis">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="skeleton" style="height: 110px"></div>
        }
      </div>
    }
  `,
  styles: `
    .pipeline { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
    .pipeline__step { display: grid; justify-items: start; gap: 6px; padding: 12px; border-radius: 12px; background: #faf6f8;
      text-decoration: none; color: inherit; }
    .pipeline__step:hover { background: var(--brand-soft); }
    .pipeline__count { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
  `,
})
export class DashboardPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly firstName = computed(() => this.auth.admin()?.fullName.split(' ')[0] ?? '');

  protected readonly pipeline = computed(() => {
    const byStatus = this.summary()?.ordersByStatus ?? {};
    return PIPELINE.map((status) => ({ status, count: byStatus[status] ?? 0, ...ORDER_STATUS[status] }));
  });

  protected readonly closed = computed(() => {
    const byStatus = this.summary()?.ordersByStatus ?? {};
    return (byStatus.CANCELLED ?? 0) + (byStatus.EXPIRED ?? 0);
  });

  constructor() {
    this.load();
    // Durante el Live los números se mueven solos; se agrupan ráfagas de eventos en una sola recarga.
    let timer: ReturnType<typeof setTimeout> | undefined;
    onAdminEvents(() => {
      clearTimeout(timer);
      timer = setTimeout(() => this.load(), 800);
    });
  }

  protected load(): void {
    this.api.summary().subscribe({
      next: (s) => this.summary.set(s),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }
}
