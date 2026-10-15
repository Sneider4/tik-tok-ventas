import { Component, computed, input } from '@angular/core';

/** Foto del producto o, si no hay, un degradado con las iniciales del tono. */
@Component({
  selector: 'app-product-thumb',
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" loading="lazy" />
    } @else {
      <span [style.background]="gradient()" aria-hidden="true">{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      width: var(--thumb-size, 72px);
      height: var(--thumb-size, 72px);
      border-radius: 12px;
      overflow: hidden;
      flex: none;
    }
    img, span {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    span {
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 800;
      font-size: 18px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
  `,
})
export class ProductThumb {
  readonly src = input<string | null>(null);
  readonly name = input.required<string>();

  /** "Tono 05 Rojo Pasión" → "05"; "Edición Nude" → "EN". En Live se pide por número de tono. */
  protected readonly initials = computed(() => {
    const number = this.name().match(/\d+/)?.[0];
    if (number) return number.slice(0, 4);
    const words = this.name().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  });

  protected readonly gradient = computed(() => {
    let hash = 0;
    for (const ch of this.name()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = 300 + (hash % 80); // rosas, fucsias, corales
    return `linear-gradient(135deg, hsl(${hue % 360} 70% 62%), hsl(${(hue + 30) % 360} 75% 48%))`;
  });
}
