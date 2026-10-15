import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { OrderStatus } from '../../../core/models';
import { ToastService } from '../../../core/toast.service';
import { OrderListItem, Paginated } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { onAdminEvents } from '../../core/admin-socket.service';
import { ORDER_STATUS, PAYMENT_METHOD } from '../../core/labels';
import { OrderDrawer } from './order-drawer';

interface Tab {
  key: string;
  label: string;
  status: OrderStatus[];
  /** Acción masiva disponible al seleccionar pedidos en esta pestaña. */
  bulk?: { label: string; action: 'labels' | 'shipped' | 'delivered' };
}

const TABS: Tab[] = [
  { key: 'all', label: 'Todos', status: [] },
  { key: 'PENDING_PAYMENT', label: 'Esperando pago', status: ['PENDING_PAYMENT'] },
  { key: 'PAYMENT_REVIEW', label: 'Revisar pago', status: ['PAYMENT_REVIEW'] },
  { key: 'PAID', label: 'Listos para guía', status: ['PAID'], bulk: { label: 'Generar guías', action: 'labels' } },
  { key: 'LABEL_GENERATED', label: 'Con guía', status: ['LABEL_GENERATED'], bulk: { label: 'Marcar despachados', action: 'shipped' } },
  { key: 'SHIPPED', label: 'Enviados', status: ['SHIPPED'], bulk: { label: 'Marcar entregados', action: 'delivered' } },
  { key: 'DELIVERED', label: 'Entregados', status: ['DELIVERED'] },
  { key: 'closed', label: 'Cancelados / expirados', status: ['CANCELLED', 'EXPIRED'] },
];

@Component({
  selector: 'app-orders-page',
  imports: [CopPipe, DatePipe, OrderDrawer],
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  /** Query params: ?estado=PAID&q=texto (enlazados desde el dashboard). */
  readonly estado = input<string>();

  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly statusLabel = ORDER_STATUS;
  protected readonly methodLabel = PAYMENT_METHOD;

  protected readonly tabKey = signal('all');
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly result = signal<Paginated<OrderListItem> | null>(null);
  protected readonly loading = signal(false);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly working = signal(false);
  protected readonly openOrderId = signal<string | null>(null);
  protected readonly stale = signal(false);

  protected readonly tab = computed(() => TABS.find((t) => t.key === this.tabKey()) ?? TABS[0]);
  protected readonly allSelected = computed(() => {
    const rows = this.result()?.data ?? [];
    return rows.length > 0 && rows.every((r) => this.selected().has(r.id));
  });

  protected readonly pages = computed(() => {
    const r = this.result();
    return r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1;
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  constructor() {
    effect(() => {
      const estado = this.estado();
      this.tabKey.set(TABS.some((t) => t.key === estado) ? estado! : 'all');
      this.page.set(1);
      this.load();
    });

    onAdminEvents(() => this.stale.set(true), ['order.created', 'order.updated']);
  }

  protected selectTab(key: string): void {
    void this.router.navigate([], { queryParams: { estado: key === 'all' ? null : key }, queryParamsHandling: 'merge' });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 350);
  }

  protected load(): void {
    this.loading.set(true);
    this.stale.set(false);
    this.selected.set(new Set());
    this.api.orders({ status: this.tab().status, search: this.search().trim(), page: this.page(), pageSize: 50 }).subscribe({
      next: (r) => {
        this.result.set(r);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.show(errorMessage(err), 'warn');
      },
    });
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected toggle(id: string, event: Event): void {
    event.stopPropagation();
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    const rows = this.result()?.data ?? [];
    this.selected.set(this.allSelected() ? new Set() : new Set(rows.map((r) => r.id)));
  }

  protected runBulk(): void {
    const bulk = this.tab().bulk;
    const ids = [...this.selected()];
    if (!bulk || ids.length === 0) return;
    this.working.set(true);

    if (bulk.action === 'labels') {
      this.api.createBatch(ids).subscribe({
        next: ({ batch, skipped }) => {
          this.working.set(false);
          if (skipped.length) this.toast.show(`${skipped.length} pedido(s) omitidos: ya tenían guía o cambiaron de estado`, 'warn', 5000);
          void this.router.navigate(['/admin/guias', batch.id]);
        },
        error: (err) => {
          this.working.set(false);
          this.toast.show(errorMessage(err), 'warn', 6000);
        },
      });
      return;
    }

    const request = bulk.action === 'shipped' ? this.api.markShipped(ids) : this.api.markDelivered(ids);
    request.subscribe({
      next: (results) => {
        this.working.set(false);
        const failed = results.filter((r) => !r.ok).length;
        this.toast.show(`${results.length - failed} pedido(s) actualizados${failed ? `, ${failed} con error` : ''}`, failed ? 'warn' : 'success');
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.toast.show(errorMessage(err), 'warn');
      },
    });
  }

  protected onDrawerChanged(): void {
    this.load();
  }
}
