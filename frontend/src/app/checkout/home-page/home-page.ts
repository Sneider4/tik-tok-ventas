import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopPipe } from '../../core/cop.pipe';
import { recentOrders } from '../../core/recent-orders';

/** Raíz del sitio: los pedidos hechos desde este celular (el checkout se abre siempre desde el link del Live). */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, CopPipe, DatePipe],
  template: `
    <main class="page page--no-bar">
      <h1 class="title">Mis pedidos</h1>
      @for (order of orders; track order.token) {
        <a class="card order" [routerLink]="['/pedido', order.token]">
          <div>
            <p class="strong">{{ order.code }}</p>
            <p class="small muted">{{ order.createdAt | date: 'd MMM y, h:mm a' }}</p>
          </div>
          <span class="strong">{{ order.totalCop | cop }}</span>
          <span aria-hidden="true">›</span>
        </a>
      } @empty {
        <div class="empty">
          <div class="empty__icon">💄</div>
          <p>Abre el link que compartimos en el Live para hacer tu pedido.</p>
        </div>
      }
    </main>
  `,
  styles: `
    .title { font-size: 24px; font-weight: 800; margin: 8px 4px 16px; }
    .order { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; margin-bottom: 10px; }
    .order > div { flex: 1; }
    .order p { margin: 0; }
  `,
})
export class HomePage {
  protected readonly orders = recentOrders.list();
}
