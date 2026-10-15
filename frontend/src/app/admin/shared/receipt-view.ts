import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { AdminApiService, openPdf } from '../core/admin-api.service';

/**
 * Muestra el comprobante (es privado: se pide con JWT y se convierte en object URL).
 * Las imágenes se ven en miniatura y se amplían al tocarlas; los PDF se abren en otra pestaña.
 */
@Component({
  selector: 'app-receipt-view',
  template: `
    @if (isPdf()) {
      <button type="button" class="receipt receipt--pdf" (click)="openPdf()">
        <span aria-hidden="true">📄</span>
        <span class="small strong">Abrir PDF</span>
      </button>
    } @else if (url()) {
      <button type="button" class="receipt" (click)="zoomed.set(true)" aria-label="Ampliar comprobante">
        <img [src]="url()" alt="Comprobante de pago" />
      </button>
    } @else if (failed()) {
      <div class="receipt receipt--pdf small muted">No se pudo cargar</div>
    } @else {
      <div class="receipt skeleton"></div>
    }

    @if (zoomed()) {
      <div class="zoom" (click)="zoomed.set(false)" role="dialog" aria-label="Comprobante ampliado">
        <img [src]="url()" alt="Comprobante de pago ampliado" />
        <span class="zoom__hint">Toca para cerrar</span>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .receipt { width: 100%; height: 100%; min-height: 180px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
      background: #f6f0f3; padding: 0; cursor: zoom-in; display: grid; place-items: center; }
    .receipt img { width: 100%; height: 100%; max-height: 320px; object-fit: contain; }
    .receipt--pdf { cursor: pointer; gap: 6px; font-size: 32px; align-content: center; }
    .zoom { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.85); display: grid; place-items: center; padding: 16px; cursor: zoom-out; }
    .zoom img { max-width: 100%; max-height: calc(100dvh - 60px); object-fit: contain; border-radius: 8px; }
    .zoom__hint { position: absolute; bottom: 16px; color: #fff; font-size: 13px; opacity: .8; }
  `,
})
export class ReceiptView {
  readonly paymentId = input.required<string>();
  readonly mimeType = input.required<string>();

  private readonly api = inject(AdminApiService);
  protected readonly url = signal<string | null>(null);
  protected readonly failed = signal(false);
  protected readonly zoomed = signal(false);
  protected readonly isPdf = () => this.mimeType() === 'application/pdf';

  constructor() {
    effect(() => {
      const id = this.paymentId();
      if (this.isPdf()) return;
      this.api.receipt(id).subscribe({
        next: (blob) => {
          this.revoke();
          this.url.set(URL.createObjectURL(blob));
        },
        error: () => this.failed.set(true),
      });
    });
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected openPdf(): void {
    this.api.receipt(this.paymentId()).subscribe((blob) => openPdf(blob, `comprobante-${this.paymentId().slice(0, 8)}.pdf`));
  }

  private revoke(): void {
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
  }
}
