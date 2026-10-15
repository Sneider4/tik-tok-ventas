import { DatePipe } from '@angular/common';
import { Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { onStockUpdates } from '../../../core/stock-socket.service';
import { ToastService } from '../../../core/toast.service';
import { InventoryMovement, InventoryRow, Paginated } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { MOVEMENT_TYPE } from '../../core/labels';

@Component({
  selector: 'app-inventory-page',
  imports: [CopPipe, DatePipe],
  templateUrl: './inventory-page.html',
  styleUrl: './inventory-page.scss',
})
export class InventoryPage {
  /** ?bajo=1 desde el dashboard */
  readonly bajo = input<string>();

  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly movementLabel = MOVEMENT_TYPE;
  protected readonly search = signal('');
  protected readonly lowStock = signal(false);
  protected readonly result = signal<Paginated<InventoryRow> | null>(null);
  protected readonly flashed = signal<Set<string>>(new Set());

  // Diálogo de ajuste
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('adjustDialog');
  protected readonly editing = signal<InventoryRow | null>(null);
  protected readonly mode = signal<'RESTOCK' | 'ADJUSTMENT'>('RESTOCK');
  protected readonly amount = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly threshold = signal<number>(3);
  protected readonly saving = signal(false);
  protected readonly movements = signal<InventoryMovement[] | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.lowStock.set(this.bajo() === '1');
      this.load();
    });

    // Las reservas del Live mueven "reservado/disponible" en vivo; resaltamos la fila que cambió.
    onStockUpdates((updates) => {
      const byId = new Map(updates.map((u) => [u.variantId, u.available]));
      this.result.update((r) =>
        r
          ? {
              ...r,
              data: r.data.map((row) => {
                const available = byId.get(row.variantId);
                if (available === undefined || available === row.available) return row;
                return { ...row, available, reserved: row.onHand - available };
              }),
            }
          : r,
      );
      this.flashed.set(new Set(byId.keys()));
      setTimeout(() => this.flashed.set(new Set()), 1200);
    });
  }

  protected readonly loadError = signal<string | null>(null);

  protected load(): void {
    this.loadError.set(null);
    this.api.inventory({ search: this.search().trim(), lowStock: this.lowStock() }).subscribe({
      next: (r) => this.result.set(r),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  protected toggleLow(): void {
    void this.router.navigate([], { queryParams: { bajo: this.lowStock() ? null : 1 } });
  }

  protected isLow(row: InventoryRow): boolean {
    return row.available <= row.lowStockThreshold;
  }

  protected openAdjust(row: InventoryRow): void {
    this.editing.set(row);
    this.mode.set('RESTOCK');
    this.amount.set(null);
    this.reason.set('');
    this.threshold.set(row.lowStockThreshold);
    this.movements.set(null);
    this.dialog()?.nativeElement.showModal();
    this.api.movements(row.variantId).subscribe({
      next: (m) => this.movements.set(m.slice(0, 15)),
      error: () => this.movements.set([]),
    });
  }

  protected closeAdjust(): void {
    this.dialog()?.nativeElement.close();
  }

  /** Delta que se enviará: entrada siempre suma; ajuste usa el signo escrito. */
  protected delta(): number {
    const value = Math.trunc(this.amount() ?? 0);
    return this.mode() === 'RESTOCK' ? Math.abs(value) : value;
  }

  protected save(): void {
    const row = this.editing();
    if (!row) return;
    const delta = this.delta();
    const thresholdChanged = this.threshold() !== row.lowStockThreshold;
    if (delta === 0 && !thresholdChanged) return this.closeAdjust();

    this.saving.set(true);
    const done = () => {
      this.saving.set(false);
      this.closeAdjust();
      this.load();
    };
    const fail = (err: unknown) => {
      this.saving.set(false);
      this.toast.show(errorMessage(err), 'warn', 6000);
    };

    const saveThreshold = () => {
      if (!thresholdChanged) return done();
      this.api.updateThreshold(row.variantId, this.threshold()).subscribe({ next: done, error: fail });
    };

    if (delta === 0) return saveThreshold();
    this.api.adjustStock(row.variantId, { delta, type: this.mode(), reason: this.reason().trim() || undefined }).subscribe({
      next: () => {
        this.toast.show(`${row.variant.sku}: ${delta > 0 ? '+' : ''}${delta} unidades`, 'success', 2500);
        saveThreshold();
      },
      error: fail,
    });
  }
}
