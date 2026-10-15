import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { concatMap, from, last } from 'rxjs';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { ToastService } from '../../../core/toast.service';
import { LiveItemInput, LiveSessionDetail, LiveSessionItem, LiveSessionStatus, ProductWithVariants } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { LIVE_STATUS } from '../../core/labels';
import { injectCopyLiveLink, liveUrl } from '../../shared/live-link';

@Component({
  selector: 'app-live-detail-page',
  imports: [RouterLink, CopPipe],
  templateUrl: './live-detail-page.html',
  styleUrl: './live-detail-page.scss',
})
export class LiveDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  protected readonly copy = injectCopyLiveLink();
  protected readonly url = liveUrl;
  protected readonly statusLabel = LIVE_STATUS;

  protected readonly live = signal<LiveSessionDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly savingRow = signal<string | null>(null);
  protected readonly changingStatus = signal(false);
  protected readonly confirmEnd = signal(false);

  // Ajustes
  protected readonly editTitle = signal('');
  protected readonly editMinutes = signal(30);
  protected readonly settingsDirty = computed(() => {
    const l = this.live();
    return !!l && (this.editTitle().trim() !== l.title || this.editMinutes() !== l.reservationMinutes);
  });

  // Selector de productos
  private readonly pickerDialog = viewChild<ElementRef<HTMLDialogElement>>('pickerDialog');
  protected readonly catalog = signal<ProductWithVariants[] | null>(null);
  protected readonly pickerSearch = signal('');
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly adding = signal(false);

  protected readonly inLive = computed(() => new Set(this.live()?.items.map((i) => i.variantId) ?? []));
  protected readonly pickerProducts = computed(() => {
    const term = this.normalize(this.pickerSearch());
    return (this.catalog() ?? [])
      .map((p) => ({
        ...p,
        variants: p.variants.filter(
          (v) => v.active && !this.inLive().has(v.id) && (!term || this.normalize(`${p.name} ${p.brand ?? ''} ${v.name} ${v.sku}`).includes(term)),
        ),
      }))
      .filter((p) => p.active && p.variants.length > 0);
  });

  constructor() {
    effect(() => this.load(this.id()));
  }

  protected load(id: string): void {
    this.loadError.set(null);
    this.api.live(id).subscribe({
      next: (l) => this.setLive(l),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  private setLive(l: LiveSessionDetail): void {
    this.live.set({ ...l, items: [...l.items].sort((a, b) => a.displayOrder - b.displayOrder) });
    this.editTitle.set(l.title);
    this.editMinutes.set(l.reservationMinutes);
  }

  // ---------- Estado ----------

  protected setStatus(status: LiveSessionStatus): void {
    const l = this.live();
    if (!l) return;
    this.changingStatus.set(true);
    this.api.setLiveStatus(l.id, status).subscribe({
      next: (updated) => {
        this.changingStatus.set(false);
        this.confirmEnd.set(false);
        this.live.update((cur) => (cur ? { ...cur, status: updated.status, startsAt: updated.startsAt, endedAt: updated.endedAt } : cur));
        this.toast.show(status === 'LIVE' ? '🔴 ¡Estás EN VIVO! El link ya recibe pedidos.' : 'Live finalizado.', 'success');
      },
      error: (err) => {
        this.changingStatus.set(false);
        this.toast.show(errorMessage(err), 'warn');
      },
    });
  }

  protected saveSettings(): void {
    const l = this.live();
    if (!l || !this.settingsDirty()) return;
    const minutes = Math.min(1440, Math.max(5, Math.trunc(this.editMinutes())));
    this.api.updateLive(l.id, { title: this.editTitle().trim(), reservationMinutes: minutes }).subscribe({
      next: (u) => {
        this.live.update((cur) => (cur ? { ...cur, title: u.title, reservationMinutes: u.reservationMinutes } : cur));
        this.editMinutes.set(u.reservationMinutes);
        this.toast.show('Ajustes guardados', 'success', 2000);
      },
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }

  // ---------- Productos del Live ----------

  protected available(item: LiveSessionItem): number {
    const inv = item.variant.inventory;
    return inv ? inv.onHand - inv.reserved : 0;
  }

  protected discount(item: LiveSessionItem): number | null {
    if (item.livePriceCop == null || item.livePriceCop >= item.variant.priceCop) return null;
    return Math.round((1 - item.livePriceCop / item.variant.priceCop) * 100);
  }

  protected setPrice(item: LiveSessionItem, raw: string): void {
    const digits = raw.replace(/\D/g, '');
    const price = digits === '' ? null : Number(digits);
    if (price === item.livePriceCop) return;
    this.saveItem(item, { livePriceCop: price });
  }

  protected setMax(item: LiveSessionItem, raw: number): void {
    const max = Math.min(50, Math.max(1, Math.trunc(raw || 1)));
    if (max === item.maxPerOrder) return;
    this.saveItem(item, { maxPerOrder: max });
  }

  protected toggleActive(item: LiveSessionItem): void {
    this.saveItem(item, { active: !item.active });
  }

  /** Intercambia el orden con el vecino (lo que ve la clienta arriba/abajo). */
  protected move(index: number, direction: -1 | 1): void {
    const items = this.live()?.items ?? [];
    const a = items[index];
    const b = items[index + direction];
    if (!a || !b) return;
    const liveId = this.id();
    // Si hay órdenes repetidas, se normalizan con la posición actual.
    const orderA = a.displayOrder === b.displayOrder ? index : a.displayOrder;
    const orderB = a.displayOrder === b.displayOrder ? index + direction : b.displayOrder;
    this.savingRow.set(a.variantId);
    this.api
      .upsertLiveItem(liveId, { variantId: a.variantId, displayOrder: orderB })
      .pipe(concatMap(() => this.api.upsertLiveItem(liveId, { variantId: b.variantId, displayOrder: orderA })))
      .subscribe({
        next: (l) => {
          this.savingRow.set(null);
          this.setLive(l);
        },
        error: (err) => this.fail(err),
      });
  }

  protected remove(item: LiveSessionItem): void {
    if (!confirm(`¿Quitar "${item.variant.product.name} · ${item.variant.name}" de este Live? Los pedidos ya hechos no se afectan.`)) return;
    this.savingRow.set(item.variantId);
    this.api.removeLiveItem(this.id(), item.variantId).subscribe({
      next: (l) => {
        this.savingRow.set(null);
        this.setLive(l);
      },
      error: (err) => this.fail(err),
    });
  }

  private saveItem(item: LiveSessionItem, changes: Omit<LiveItemInput, 'variantId'>): void {
    this.savingRow.set(item.variantId);
    this.api.upsertLiveItem(this.id(), { variantId: item.variantId, ...changes }).subscribe({
      next: (l) => {
        this.savingRow.set(null);
        this.setLive(l);
      },
      error: (err) => this.fail(err),
    });
  }

  private fail(err: unknown): void {
    this.savingRow.set(null);
    this.toast.show(errorMessage(err), 'warn', 6000);
    this.load(this.id());
  }

  // ---------- Selector ----------

  protected openPicker(): void {
    this.picked.set(new Set());
    this.pickerSearch.set('');
    this.pickerDialog()?.nativeElement.showModal();
    this.api.products({ pageSize: 200 }).subscribe({
      next: (r) => this.catalog.set(r.data),
      error: (err) => this.toast.show(errorMessage(err), 'warn'),
    });
  }

  protected closePicker(): void {
    this.pickerDialog()?.nativeElement.close();
  }

  protected togglePick(variantId: string): void {
    this.picked.update((set) => {
      const next = new Set(set);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  protected pickAll(product: ProductWithVariants): void {
    this.picked.update((set) => new Set([...set, ...product.variants.map((v) => v.id)]));
  }

  protected addPicked(): void {
    const ids = [...this.picked()];
    if (ids.length === 0) return;
    const start = Math.max(-1, ...(this.live()?.items.map((i) => i.displayOrder) ?? [])) + 1;
    this.adding.set(true);
    from(ids.map((variantId, i) => ({ variantId, displayOrder: start + i, maxPerOrder: 5 })))
      .pipe(
        concatMap((item) => this.api.upsertLiveItem(this.id(), item)),
        last(),
      )
      .subscribe({
        next: (l) => {
          this.adding.set(false);
          this.setLive(l);
          this.closePicker();
          this.toast.show(`${ids.length} producto(s) agregados al Live`, 'success');
        },
        error: (err) => {
          this.adding.set(false);
          this.fail(err);
        },
      });
  }

  private normalize(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
