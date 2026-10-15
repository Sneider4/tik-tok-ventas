import { computed, Injectable, signal } from '@angular/core';
import { Live, LiveItem } from './models';
import { local } from './storage';

export interface CartLine {
  item: LiveItem;
  quantity: number;
}

/**
 * Carrito por Live, en signals y guardado en el dispositivo
 * (si la clienta cierra TikTok y vuelve al link, su selección sigue ahí).
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly live = signal<Live | null>(null);
  private readonly quantities = signal<Record<string, number>>({});

  readonly liveData = this.live.asReadonly();

  readonly lines = computed<CartLine[]>(() => {
    const live = this.live();
    if (!live) return [];
    const qty = this.quantities();
    return live.items.filter((i) => (qty[i.variantId] ?? 0) > 0).map((item) => ({ item, quantity: qty[item.variantId] }));
  });

  readonly units = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));
  readonly subtotal = computed(() => this.lines().reduce((sum, l) => sum + l.quantity * l.item.priceCop, 0));

  readonly shipping = computed(() => {
    const live = this.live();
    if (!live || this.units() === 0) return 0;
    const { flatCop, freeFromCop } = live.shipping;
    return freeFromCop && this.subtotal() >= freeFromCop ? 0 : flatCop;
  });

  /** Cuánto falta para envío gratis (null si no aplica o ya lo alcanzó). */
  readonly missingForFreeShipping = computed(() => {
    const freeFrom = this.live()?.shipping.freeFromCop;
    if (!freeFrom || this.units() === 0) return null;
    const missing = freeFrom - this.subtotal();
    return missing > 0 ? missing : null;
  });

  readonly total = computed(() => this.subtotal() + this.shipping());

  /** Carga el Live y recupera el carrito guardado, ajustado al stock actual. */
  setLive(live: Live): void {
    const saved = local.get<Record<string, number>>(this.key(live.slug), {});
    const restored: Record<string, number> = {};
    for (const item of live.items) {
      const q = Math.min(saved[item.variantId] ?? 0, this.maxFor(item));
      if (q > 0) restored[item.variantId] = q;
    }
    this.live.set(live);
    this.quantities.set(restored);
    this.persist();
  }

  quantityOf(variantId: string): number {
    return this.quantities()[variantId] ?? 0;
  }

  maxFor(item: LiveItem): number {
    return Math.max(0, Math.min(item.maxPerOrder, item.available));
  }

  setQuantity(variantId: string, quantity: number): void {
    const item = this.live()?.items.find((i) => i.variantId === variantId);
    if (!item) return;
    const q = Math.max(0, Math.min(quantity, this.maxFor(item)));
    this.quantities.update((current) => {
      const next = { ...current };
      if (q === 0) delete next[variantId];
      else next[variantId] = q;
      return next;
    });
    this.persist();
  }

  /**
   * Aplica stock nuevo (WebSocket o respuesta 409). Devuelve los nombres de los productos
   * cuya cantidad en el carrito tuvo que bajar, para avisarle a la clienta.
   */
  applyAvailability(updates: { variantId: string; available: number }[]): string[] {
    const live = this.live();
    if (!live) return [];
    const byId = new Map(updates.map((u) => [u.variantId, u.available]));
    if (!live.items.some((i) => byId.has(i.variantId))) return [];

    const items = live.items.map((i) => (byId.has(i.variantId) ? { ...i, available: byId.get(i.variantId)! } : i));
    this.live.set({ ...live, items });

    const reduced: string[] = [];
    for (const item of items) {
      const q = this.quantityOf(item.variantId);
      if (q > this.maxFor(item)) {
        this.setQuantity(item.variantId, this.maxFor(item));
        reduced.push(`${item.productName} ${item.variantName}`);
      }
    }
    return reduced;
  }

  clear(): void {
    this.quantities.set({});
    this.persist();
  }

  private persist(): void {
    const live = this.live();
    if (live) local.set(this.key(live.slug), this.quantities());
  }

  private key(slug: string): string {
    return `cart:${slug}`;
  }
}
