import { Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastService } from '../../core/toast.service';
import { AdminApiService } from '../core/admin-api.service';
import { onAdminEvents } from '../core/admin-socket.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  // Estilos compartidos por todas las pantallas del panel (prefijo .adm-); solo se cargan al entrar a /admin.
  encapsulation: ViewEncapsulation.None,
})
export class AdminLayout {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly pendingPayments = signal(0);
  protected readonly menuOpen = signal(false);

  protected readonly nav = [
    { path: '/admin', label: 'Inicio', icon: '📊', exact: true },
    { path: '/admin/pagos', label: 'Comprobantes', icon: '🧾', exact: false, badge: true },
    { path: '/admin/pedidos', label: 'Pedidos', icon: '📦', exact: false },
    { path: '/admin/guias', label: 'Guías', icon: '🚚', exact: false },
    { path: '/admin/lives', label: 'Lives', icon: '🎥', exact: false },
    { path: '/admin/productos', label: 'Productos', icon: '🏷️', exact: false },
    { path: '/admin/inventario', label: 'Inventario', icon: '💄', exact: false },
  ];

  constructor() {
    this.refreshBadge();
    onAdminEvents((event) => {
      if (event.name === 'payment.submitted') this.toast.show('🧾 Llegó un comprobante nuevo', 'info');
      if (event.name === 'order.created') this.toast.show(`🛍️ Nuevo pedido ${String(event.payload['code'] ?? '')}`, 'info', 3000);
      if (event.name === 'payment.submitted' || event.name === 'order.updated') this.refreshBadge();
    });
  }

  private badgeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Agrupa ráfagas de eventos del Live en una sola consulta. */
  private refreshBadge(): void {
    clearTimeout(this.badgeTimer);
    this.badgeTimer = setTimeout(() => this.api.summary().subscribe((s) => this.pendingPayments.set(s.pendingPayments)), 500);
  }
}
