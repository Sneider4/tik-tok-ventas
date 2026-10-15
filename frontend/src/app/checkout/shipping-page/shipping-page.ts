import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of, switchMap, tap } from 'rxjs';
import { ApiService, errorBody, errorMessage } from '../../core/api.service';
import { CartStore } from '../../core/cart.store';
import { CopPipe } from '../../core/cop.pipe';
import { CheckoutRequest, City, DocumentType } from '../../core/models';
import { recentOrders } from '../../core/recent-orders';
import { onStockUpdates } from '../../core/stock-socket.service';
import { local } from '../../core/storage';
import { ToastService } from '../../core/toast.service';

const PROFILE_KEY = 'customer-profile';

const normalizePhone = (value: string) => value.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');

function colombianMobile(control: AbstractControl<string>): ValidationErrors | null {
  return !control.value || /^3\d{9}$/.test(normalizePhone(control.value)) ? null : { phone: true };
}

interface SavedProfile {
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  email: string;
  tiktokUsername: string;
  departmentCode: string;
  cityCode: string;
  addressLine: string;
  neighborhood: string;
  additionalInfo: string;
}

@Component({
  selector: 'app-shipping-page',
  imports: [ReactiveFormsModule, RouterLink, CopPipe],
  templateUrl: './shipping-page.html',
  styleUrl: './shipping-page.scss',
})
export class ShippingPage {
  readonly slug = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartStore);

  protected readonly documentTypes: { value: DocumentType; label: string }[] = [
    { value: 'CC', label: 'C.C.' },
    { value: 'CE', label: 'C.E.' },
    { value: 'TI', label: 'T.I.' },
    { value: 'PPT', label: 'PPT' },
    { value: 'PP', label: 'Pasaporte' },
    { value: 'NIT', label: 'NIT' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    documentType: ['CC' as DocumentType, Validators.required],
    documentNumber: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9.\s-]{4,24}$/)]],
    phone: ['', [Validators.required, colombianMobile]],
    email: ['', [Validators.email]],
    tiktokUsername: ['', [Validators.maxLength(60)]],
    departmentCode: ['', Validators.required],
    cityCode: ['', Validators.required],
    addressLine: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(200)]],
    neighborhood: ['', Validators.maxLength(100)],
    additionalInfo: ['', Validators.maxLength(200)],
    notes: ['', Validators.maxLength(500)],
    remember: [true],
    acceptsDataPolicy: [false, Validators.requiredTrue],
  });

  protected readonly departments = toSignal(this.api.departments(), { initialValue: [] });
  protected readonly cities = signal<City[]>([]);
  protected readonly loadingCities = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly outOfStockNotice = signal<string[]>([]);

  protected readonly ready = computed(() => this.cart.liveData()?.slug === this.slug());

  /** Una llave por intento: si la red reintenta o hay doble toque, el backend devuelve el mismo pedido. */
  private idempotencyKey = crypto.randomUUID();

  constructor() {
    // Si se entra directo a /datos (recarga), traer el Live para reconstruir el carrito guardado.
    effect(() => {
      const slug = this.slug();
      if (this.cart.liveData()?.slug !== slug) this.api.getLive(slug).subscribe((live) => this.cart.setLive(live));
    });

    this.form.controls.departmentCode.valueChanges
      .pipe(
        tap(() => {
          this.form.controls.cityCode.setValue('');
          this.cities.set([]);
        }),
        switchMap((code) => {
          if (!code) return of([]);
          this.loadingCities.set(true);
          return this.api.cities(code);
        }),
        takeUntilDestroyed(),
      )
      .subscribe((cities) => {
        this.cities.set(cities);
        this.loadingCities.set(false);
        const pending = this.pendingCityCode;
        if (pending && cities.some((c) => c.code === pending)) this.form.controls.cityCode.setValue(pending);
        this.pendingCityCode = null;
      });

    onStockUpdates((updates) => {
      const reduced = this.cart.applyAvailability(updates);
      if (reduced.length) this.toast.show(`Se agotaron unidades de: ${reduced.join(', ')}`, 'warn', 6000);
    });

    this.restoreProfile();
  }

  private pendingCityCode: string | null = null;

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.form.touched);
  }

  protected submit(): void {
    this.submitError.set(null);
    this.outOfStockNotice.set([]);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.scrollToFirstError();
      return;
    }
    if (this.cart.units() === 0 || this.submitting()) return;

    const v = this.form.getRawValue();
    const body: CheckoutRequest = {
      items: this.cart.lines().map((l) => ({ variantId: l.item.variantId, quantity: l.quantity })),
      customer: {
        fullName: v.fullName.trim(),
        documentType: v.documentType,
        documentNumber: v.documentNumber,
        phone: normalizePhone(v.phone),
        email: v.email.trim() || undefined,
        tiktokUsername: v.tiktokUsername.trim() || undefined,
      },
      shipping: {
        cityCode: v.cityCode,
        addressLine: v.addressLine.trim(),
        neighborhood: v.neighborhood.trim() || undefined,
        additionalInfo: v.additionalInfo.trim() || undefined,
      },
      notes: v.notes.trim() || undefined,
      acceptsDataPolicy: v.acceptsDataPolicy,
    };

    if (v.remember) this.saveProfile();
    else local.remove(PROFILE_KEY);

    this.submitting.set(true);
    this.api.checkout(this.slug(), body, this.idempotencyKey).subscribe({
      next: (order) => {
        recentOrders.add({ token: order.publicToken, code: order.code, totalCop: order.totalCop, createdAt: order.createdAt });
        this.cart.clear();
        void this.router.navigate(['/pedido', order.publicToken], { replaceUrl: true });
      },
      error: (err) => {
        this.submitting.set(false);
        const body = errorBody(err);
        if (body?.code === 'OUT_OF_STOCK' && body.items) {
          // Alguien se llevó la(s) última(s) unidad(es) un segundo antes.
          const names = this.cart
            .lines()
            .filter((l) => body.items!.some((i) => i.variantId === l.item.variantId))
            .map((l) => `${l.item.productName} ${l.item.variantName}`);
          this.cart.applyAvailability(body.items.map((i) => ({ variantId: i.variantId, available: i.available })));
          this.outOfStockNotice.set(names);
          this.idempotencyKey = crypto.randomUUID();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        this.submitError.set(errorMessage(err));
      },
    });
  }

  private scrollToFirstError(): void {
    setTimeout(() => document.querySelector('.ng-invalid:not(form)')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  private saveProfile(): void {
    const { notes: _n, remember: _r, acceptsDataPolicy: _a, ...profile } = this.form.getRawValue();
    local.set(PROFILE_KEY, profile satisfies SavedProfile);
  }

  private restoreProfile(): void {
    const saved = local.get<SavedProfile | null>(PROFILE_KEY, null);
    if (!saved) return;
    const { departmentCode, cityCode, ...rest } = saved;
    this.form.patchValue(rest);
    if (departmentCode) {
      this.pendingCityCode = cityCode;
      this.form.controls.departmentCode.setValue(departmentCode);
    }
  }
}
