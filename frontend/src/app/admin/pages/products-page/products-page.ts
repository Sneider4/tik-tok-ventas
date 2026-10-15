import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { Paginated, ProductWithVariants } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { ProductThumb } from '../../../checkout/shared/product-thumb';

@Component({
  selector: 'app-products-page',
  imports: [RouterLink, ProductThumb],
  template: `
    <header class="adm-head">
      <h1>Productos</h1>
      <a class="btn btn--primary btn--sm" routerLink="/admin/productos/nuevo">+ Nuevo producto</a>
    </header>

    <div class="adm-toolbar">
      <input class="input" type="search" placeholder="Buscar por nombre, marca o SKU" [value]="search()" (input)="onSearch($any($event.target).value)" aria-label="Buscar productos" />
      @if (result(); as r) {
        <span class="small muted">{{ r.total }} productos</span>
      }
    </div>

    @if (loadError()) {
      <div class="adm-empty">
        <p>{{ loadError() }}</p>
        <button type="button" class="btn btn--ghost btn--sm" (click)="load()">Reintentar</button>
      </div>
    } @else if (result(); as r) {
      @if (r.data.length === 0) {
        <div class="adm-empty">No hay productos{{ search() ? ' con "' + search() + '"' : '' }}.</div>
      } @else {
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Variantes</th>
                <th class="num">Precio</th>
                <th class="num">Disponible</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (p of r.data; track p.id) {
                <tr class="adm-row--click" [routerLink]="['/admin/productos', p.id]">
                  <td>
                    <div class="row pr-name">
                      <app-product-thumb [src]="p.imageUrl" [name]="p.name" style="--thumb-size: 40px" />
                      <div>
                        <div class="strong">{{ p.name }}</div>
                        <div class="small muted">{{ p.brand ?? 'Sin marca' }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="small">{{ variantNames(p) }}</span>
                  </td>
                  <td class="num">{{ priceRange(p) }}</td>
                  <td class="num">{{ available(p) }}</td>
                  <td>
                    <span class="badge" [class]="'badge ' + (p.active ? 'badge--success' : 'badge--muted')">{{ p.active ? 'Activo' : 'Inactivo' }}</span>
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
  styles: `
    .pr-name { gap: 10px; }
    td span.small { display: inline-block; max-width: 360px; }
  `,
})
export class ProductsPage {
  private readonly api = inject(AdminApiService);
  private readonly cop = new CopPipe();

  protected readonly search = signal('');
  protected readonly result = signal<Paginated<ProductWithVariants> | null>(null);
  protected readonly loadError = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    this.api.products({ search: this.search().trim(), pageSize: 200 }).subscribe({
      next: (r) => this.result.set(r),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 300);
  }

  protected variantNames(p: ProductWithVariants): string {
    const names = p.variants.map((v) => v.name);
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.join(', ') || '—';
  }

  protected priceRange(p: ProductWithVariants): string {
    const prices = p.variants.map((v) => v.priceCop);
    if (prices.length === 0) return '—';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? this.cop.transform(min) : `${this.cop.transform(min)} – ${this.cop.transform(max)}`;
  }

  protected available(p: ProductWithVariants): number {
    return p.variants.reduce((sum, v) => sum + (v.inventory ? v.inventory.onHand - v.inventory.reserved : 0), 0);
  }
}
