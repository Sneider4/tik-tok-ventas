import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, concatMap, from, map, of, toArray } from 'rxjs';
import { errorMessage } from '../../../core/api.service';
import { CopPipe } from '../../../core/cop.pipe';
import { ToastService } from '../../../core/toast.service';
import { ProductVariant, ProductWithVariants, VariantInput } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { suggestSku } from '../../core/labels';

/** Fila editable de una variante nueva (aún sin guardar). */
interface DraftVariant {
  key: number;
  name: string;
  sku: string;
  skuTouched: boolean;
  price: string;
  stock: string;
  weight: string;
  threshold: string;
}

/** Copia editable de una variante existente. */
interface EditableVariant {
  variant: ProductVariant;
  name: string;
  price: string;
  weight: string;
  imageUrl: string;
  active: boolean;
}

const SKU_RE = /^[A-Z0-9-]{3,40}$/;
const digits = (value: string) => value.replace(/\D/g, '');
const isUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

@Component({
  selector: 'app-product-form-page',
  imports: [RouterLink, CopPipe],
  templateUrl: './product-form-page.html',
  styleUrl: './product-form-page.scss',
})
export class ProductFormPage {
  /** Ausente en /admin/productos/nuevo. */
  readonly id = input<string>();

  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly isNew = computed(() => !this.id());
  protected readonly product = signal<ProductWithVariants | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);

  // Datos del producto
  protected readonly name = signal('');
  protected readonly brand = signal('');
  protected readonly description = signal('');
  protected readonly imageUrl = signal('');
  protected readonly active = signal(true);

  protected readonly productDirty = computed(() => {
    const p = this.product();
    return (
      !!p &&
      (this.name().trim() !== p.name ||
        this.brand().trim() !== (p.brand ?? '') ||
        this.description().trim() !== (p.description ?? '') ||
        this.imageUrl().trim() !== (p.imageUrl ?? '') ||
        this.active() !== p.active)
    );
  });

  // Variantes nuevas (creación o "agregar tono")
  private seq = 0;
  protected readonly drafts = signal<DraftVariant[]>([]);
  // Variantes existentes (edición)
  protected readonly editable = signal<EditableVariant[]>([]);
  protected readonly savingVariant = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) this.load(id);
      else {
        this.product.set(null);
        this.drafts.set([this.newDraft()]);
      }
    });
  }

  protected load(id: string): void {
    this.loadError.set(null);
    this.api.product(id).subscribe({
      next: (p) => this.setProduct(p),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  private setProduct(p: ProductWithVariants): void {
    this.product.set(p);
    this.name.set(p.name);
    this.brand.set(p.brand ?? '');
    this.description.set(p.description ?? '');
    this.imageUrl.set(p.imageUrl ?? '');
    this.active.set(p.active);
    this.editable.set(
      p.variants.map((v) => ({
        variant: v,
        name: v.name,
        price: String(v.priceCop),
        weight: String(v.weightGrams),
        imageUrl: v.imageUrl ?? '',
        active: v.active,
      })),
    );
    this.drafts.set([]);
  }

  // ---------- Borradores de variantes ----------

  protected newDraft(): DraftVariant {
    return { key: ++this.seq, name: '', sku: '', skuTouched: false, price: '', stock: '0', weight: '100', threshold: '3' };
  }

  protected addDraft(): void {
    // Copia precio y peso de la última fila: en un labial todos los tonos suelen costar lo mismo.
    const last = this.drafts().at(-1) ?? this.editable().at(-1);
    const base = this.newDraft();
    if (last) {
      base.price = last.price;
      base.weight = last.weight;
    }
    this.drafts.update((d) => [...d, base]);
  }

  protected removeDraft(key: number): void {
    this.drafts.update((d) => d.filter((x) => x.key !== key));
  }

  protected updateDraft(key: number, field: keyof DraftVariant, value: string): void {
    this.drafts.update((list) =>
      list.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, [field]: value };
        if (field === 'sku') {
          next.sku = value.toUpperCase().replace(/[^A-Z0-9-]/g, '-');
          next.skuTouched = true;
        }
        if (field === 'name' && !d.skuTouched) next.sku = suggestSku(this.name(), value);
        return next;
      }),
    );
  }

  /** Si cambia el nombre del producto, se re-sugieren los SKU no editados a mano. */
  protected onProductName(value: string): void {
    this.name.set(value);
    this.drafts.update((list) => list.map((d) => (d.skuTouched || !d.name ? d : { ...d, sku: suggestSku(value, d.name) })));
  }

  private draftToInput(d: DraftVariant): VariantInput {
    return {
      sku: d.sku,
      name: d.name.trim(),
      priceCop: Number(digits(d.price)),
      weightGrams: Number(digits(d.weight)) || 100,
      initialStock: Number(digits(d.stock)) || 0,
      lowStockThreshold: Number(digits(d.threshold)) || 0,
    };
  }

  private validateDrafts(list: DraftVariant[]): string[] {
    const problems: string[] = [];
    const skus = new Set<string>();
    list.forEach((d, i) => {
      const label = d.name.trim() || `Variante ${i + 1}`;
      if (d.name.trim().length < 1) problems.push(`${label}: escribe el nombre del tono o presentación.`);
      if (!SKU_RE.test(d.sku)) problems.push(`${label}: el SKU debe tener 3-40 caracteres (A-Z, 0-9, guiones).`);
      if (skus.has(d.sku)) problems.push(`${label}: SKU repetido (${d.sku}).`);
      skus.add(d.sku);
      if (!(Number(digits(d.price)) > 0)) problems.push(`${label}: escribe el precio.`);
    });
    return problems;
  }

  // ---------- Guardar ----------

  protected saveNew(): void {
    const problems = [
      ...(this.name().trim().length < 2 ? ['Escribe el nombre del producto.'] : []),
      ...(this.imageUrl().trim() && !isUrl(this.imageUrl().trim()) ? ['La URL de la imagen no es válida.'] : []),
      ...(this.drafts().length === 0 ? ['Agrega al menos una variante (tono, tamaño…).'] : []),
      ...this.validateDrafts(this.drafts()),
    ];
    this.errors.set(problems);
    if (problems.length) return;

    this.saving.set(true);
    this.api
      .createProduct({
        name: this.name().trim(),
        brand: this.brand().trim() || undefined,
        description: this.description().trim() || undefined,
        imageUrl: this.imageUrl().trim() || undefined,
        variants: this.drafts().map((d) => this.draftToInput(d)),
      })
      .subscribe({
        next: (p) => {
          this.saving.set(false);
          this.toast.show(`"${p.name}" creado con ${p.variants.length} variante(s)`, 'success');
          void this.router.navigate(['/admin/productos', p.id], { replaceUrl: true });
        },
        error: (err) => {
          this.saving.set(false);
          this.errors.set([this.conflictMessage(err)]);
        },
      });
  }

  protected saveProduct(): void {
    const p = this.product();
    if (!p || !this.productDirty()) return;
    const problems = [
      ...(this.name().trim().length < 2 ? ['Escribe el nombre del producto.'] : []),
      ...(this.imageUrl().trim() && !isUrl(this.imageUrl().trim()) ? ['La URL de la imagen no es válida.'] : []),
    ];
    this.errors.set(problems);
    if (problems.length) return;

    this.saving.set(true);
    this.api
      .updateProduct(p.id, {
        name: this.name().trim(),
        brand: this.brand().trim() || null,
        description: this.description().trim() || null,
        imageUrl: this.imageUrl().trim() || null,
        active: this.active(),
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.setProduct(updated);
          this.toast.show('Producto guardado', 'success', 2000);
        },
        error: (err) => {
          this.saving.set(false);
          this.errors.set([errorMessage(err)]);
        },
      });
  }

  protected updateEditable(id: string, field: 'name' | 'price' | 'weight' | 'imageUrl', value: string): void {
    this.editable.update((list) => list.map((e) => (e.variant.id === id ? { ...e, [field]: value } : e)));
  }

  protected toggleVariant(id: string): void {
    this.editable.update((list) => list.map((e) => (e.variant.id === id ? { ...e, active: !e.active } : e)));
  }

  protected variantDirty(e: EditableVariant): boolean {
    const v = e.variant;
    return (
      e.name.trim() !== v.name ||
      Number(digits(e.price)) !== v.priceCop ||
      Number(digits(e.weight)) !== v.weightGrams ||
      e.imageUrl.trim() !== (v.imageUrl ?? '') ||
      e.active !== v.active
    );
  }

  protected saveVariant(e: EditableVariant): void {
    const price = Number(digits(e.price));
    if (!e.name.trim()) return this.toast.show('El nombre de la variante no puede quedar vacío', 'warn');
    if (!(price > 0)) return this.toast.show('Escribe un precio válido', 'warn');
    if (e.imageUrl.trim() && !isUrl(e.imageUrl.trim())) return this.toast.show('La URL de la imagen no es válida', 'warn');

    this.savingVariant.set(e.variant.id);
    this.api
      .updateVariant(e.variant.id, {
        name: e.name.trim(),
        priceCop: price,
        weightGrams: Number(digits(e.weight)) || 100,
        imageUrl: e.imageUrl.trim() || null,
        active: e.active,
      })
      .subscribe({
        next: () => {
          this.savingVariant.set(null);
          this.toast.show(`${e.variant.sku} guardado`, 'success', 2000);
          this.load(this.id()!);
        },
        error: (err) => {
          this.savingVariant.set(null);
          this.toast.show(errorMessage(err), 'warn', 6000);
        },
      });
  }

  protected saveDrafts(): void {
    const p = this.product();
    const list = this.drafts();
    if (!p || list.length === 0) return;
    const existing = new Set(p.variants.map((v) => v.sku));
    const problems = [
      ...this.validateDrafts(list),
      ...list.filter((d) => existing.has(d.sku)).map((d) => `${d.sku} ya existe en este producto.`),
    ];
    this.errors.set(problems);
    if (problems.length) return;

    this.saving.set(true);
    // Una a una, para reportar exactamente cuál falla (p. ej. SKU usado en otro producto)
    // y dejar en pantalla solo los borradores que no se pudieron guardar.
    from(list)
      .pipe(
        concatMap((d) =>
          this.api.addVariant(p.id, this.draftToInput(d)).pipe(
            map((product) => ({ d, product, error: null as string | null })),
            catchError((err: unknown) => of({ d, product: null, error: `${d.sku}: ${this.conflictMessage(err)}` })),
          ),
        ),
        toArray(),
      )
      .subscribe((results) => {
        this.saving.set(false);
        const latest = results.map((r) => r.product).filter((x): x is ProductWithVariants => !!x).at(-1);
        const failed = results.filter((r) => r.error);
        if (latest) this.setProduct(latest);
        this.drafts.set(failed.map((r) => r.d));
        this.errors.set(failed.map((r) => r.error!));
        const ok = results.length - failed.length;
        if (ok > 0) this.toast.show(`${ok} variante(s) agregadas`, 'success');
      });
  }

  private conflictMessage(err: unknown): string {
    return (err as { status?: number }).status === 409 ? 'Ese SKU ya está en uso. Cada variante necesita un SKU único.' : errorMessage(err);
  }
}
