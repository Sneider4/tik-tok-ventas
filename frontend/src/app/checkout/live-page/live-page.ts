import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorMessage, ApiService } from '../../core/api.service';
import { CartStore } from '../../core/cart.store';
import { CopPipe } from '../../core/cop.pipe';
import { LiveItem } from '../../core/models';
import { onStockUpdates } from '../../core/stock-socket.service';
import { ToastService } from '../../core/toast.service';
import { ProductThumb } from '../shared/product-thumb';

@Component({
  selector: 'app-live-page',
  imports: [RouterLink, CopPipe, ProductThumb],
  templateUrl: './live-page.html',
  styleUrl: './live-page.scss',
})
export class LivePage {
  /** Viene de la ruta /live/:slug */
  readonly slug = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartStore);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');

  protected readonly live = computed(() => {
    const live = this.cart.liveData();
    return live?.slug === this.slug() ? live : null;
  });

  protected readonly filtered = computed(() => {
    const items = this.live()?.items ?? [];
    const term = this.normalize(this.search());
    if (!term) return items;
    return items.filter((i) => this.normalize(`${i.productName} ${i.variantName} ${i.brand ?? ''} ${i.sku}`).includes(term));
  });

  constructor() {
    effect(() => this.load(this.slug()));

    onStockUpdates((updates) => {
      const reduced = this.cart.applyAvailability(updates);
      if (reduced.length) this.toast.show(`Se agotaron unidades de: ${reduced.join(', ')}. Ajustamos tu carrito.`, 'warn', 6000);
    });
  }

  protected load(slug: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getLive(slug).subscribe({
      next: (live) => {
        this.cart.setLive(live);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected change(item: LiveItem, delta: number): void {
    const next = this.cart.quantityOf(item.variantId) + delta;
    if (delta > 0 && next > this.cart.maxFor(item)) {
      this.toast.show(
        item.available > item.maxPerOrder
          ? `Máximo ${item.maxPerOrder} por pedido`
          : item.available === 1
            ? 'Solo queda 1 disponible'
            : `Solo quedan ${item.available} disponibles`,
        'warn',
      );
      return;
    }
    this.cart.setQuantity(item.variantId, next);
  }

  protected stockLabel(item: LiveItem): { text: string; kind: string } | null {
    if (item.available === 0) return { text: 'Agotado', kind: 'badge--muted' };
    if (item.available <= 3) return { text: item.available === 1 ? '¡Última unidad!' : `¡Últimas ${item.available}!`, kind: 'badge--danger' };
    return null;
  }

  private normalize(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
