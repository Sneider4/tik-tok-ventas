import { DatePipe } from '@angular/common';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api.service';
import { ToastService } from '../../../core/toast.service';
import { LiveSessionSummary } from '../../core/admin-models';
import { AdminApiService } from '../../core/admin-api.service';
import { LIVE_STATUS, slugify } from '../../core/labels';
import { injectCopyLiveLink, liveUrl } from '../../shared/live-link';

@Component({
  selector: 'app-lives-page',
  imports: [DatePipe, RouterLink],
  template: `
    <header class="adm-head">
      <h1>Lives</h1>
      <button type="button" class="btn btn--primary btn--sm" (click)="openCreate()">+ Nuevo Live</button>
    </header>

    @if (loadError()) {
      <div class="adm-empty">
        <p>{{ loadError() }}</p>
        <button type="button" class="btn btn--ghost btn--sm" (click)="load()">Reintentar</button>
      </div>
    } @else if (lives(); as list) {
      @if (list.length === 0) {
        <div class="adm-empty">Crea tu primer Live para obtener el link de compra que compartes en TikTok.</div>
      } @else {
        <div class="lv-list">
          @for (l of list; track l.id) {
            <article class="lv-card" [class.lv-card--live]="l.status === 'LIVE'">
              <a class="lv-card__main" [routerLink]="['/admin/lives', l.id]">
                <div class="row">
                  <span class="badge" [class]="'badge ' + statusLabel[l.status].badge">{{ statusLabel[l.status].label }}</span>
                  <span class="small muted">{{ (l.startsAt ?? l.createdAt) | date: 'd MMM y, h:mm a' }}</span>
                </div>
                <h2>{{ l.title }}</h2>
                <p class="small muted mono">/live/{{ l.slug }}</p>
                <p class="small">
                  <strong>{{ l._count.items }}</strong> productos · <strong>{{ l._count.orders }}</strong> pedidos ·
                  reserva {{ l.reservationMinutes }} min
                </p>
              </a>
              <div class="lv-card__actions">
                <button type="button" class="btn btn--ghost btn--sm" (click)="copy(l.slug)">🔗 Copiar link</button>
                <a class="btn btn--outline btn--sm" [href]="url(l.slug)" target="_blank" rel="noopener">Ver como cliente</a>
              </div>
            </article>
          }
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 200px"></div>
    }

    <dialog class="adm-dialog" #createDialog>
      <form class="adm-dialog__body" (submit)="$event.preventDefault(); create()">
        <h2>Nuevo Live</h2>
        <label class="field">
          <span class="field__label">Título</span>
          <input class="input" [value]="title()" (input)="onTitle($any($event.target).value)" placeholder="Ej: Live de Halloween 🎃" maxlength="120" />
        </label>
        <label class="field">
          <span class="field__label">Link</span>
          <div class="lv-slug">
            <span class="muted small">/live/</span>
            <input class="input" [value]="slug()" (input)="onSlug($any($event.target).value)" maxlength="60" autocapitalize="off" />
          </div>
          <span class="field__hint">Solo minúsculas, números y guiones. No se puede cambiar después de crear el Live.</span>
        </label>
        <label class="field">
          <span class="field__label">Minutos para pagar</span>
          <input class="input" type="number" min="5" max="1440" [value]="minutes()" (input)="minutes.set($any($event.target).valueAsNumber || 30)" />
          <span class="field__hint">Tiempo que se apartan los productos mientras la clienta sube el comprobante.</span>
        </label>
        @if (formError()) {
          <p class="alert alert--danger" style="margin: 0">{{ formError() }}</p>
        }
        <div class="adm-dialog__actions">
          <button type="button" class="btn btn--outline" (click)="closeCreate()">Cancelar</button>
          <button type="submit" class="btn btn--primary" [disabled]="saving()">Crear Live</button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .lv-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; }
    .lv-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); display: grid; }
    .lv-card--live { border-color: var(--live); box-shadow: 0 0 0 3px rgba(239, 68, 68, .12); }
    .lv-card__main { padding: 16px; display: grid; gap: 6px; text-decoration: none; color: inherit; }
    .lv-card__main h2 { font-size: 18px; font-weight: 800; }
    .lv-card__main p { margin: 0; }
    .lv-card__actions { display: flex; gap: 8px; padding: 0 16px 16px; flex-wrap: wrap; }
    .lv-slug { display: flex; align-items: center; gap: 6px; }
  `,
})
export class LivesPage {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly copy = injectCopyLiveLink();
  protected readonly url = liveUrl;
  protected readonly statusLabel = LIVE_STATUS;

  protected readonly lives = signal<LiveSessionSummary[] | null>(null);
  protected readonly loadError = signal<string | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('createDialog');
  protected readonly title = signal('');
  protected readonly slug = signal('');
  protected readonly minutes = signal(30);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  private slugTouched = false;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    this.api.lives().subscribe({
      next: (l) => this.lives.set(l),
      error: (err) => this.loadError.set(errorMessage(err)),
    });
  }

  protected openCreate(): void {
    this.title.set('');
    this.slug.set('');
    this.minutes.set(30);
    this.formError.set(null);
    this.slugTouched = false;
    this.dialog()?.nativeElement.showModal();
  }

  protected closeCreate(): void {
    this.dialog()?.nativeElement.close();
  }

  protected onTitle(value: string): void {
    this.title.set(value);
    if (!this.slugTouched) this.slug.set(slugify(value));
  }

  protected onSlug(value: string): void {
    this.slugTouched = true;
    this.slug.set(value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  }

  protected create(): void {
    const title = this.title().trim();
    const slug = this.slug().replace(/^-+|-+$/g, '');
    if (title.length < 3) return this.formError.set('Escribe un título.');
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) return this.formError.set('El link debe tener entre 3 y 60 caracteres (minúsculas, números y guiones).');

    this.saving.set(true);
    this.api.createLive({ title, slug, reservationMinutes: this.minutes() }).subscribe({
      next: (live) => {
        this.saving.set(false);
        this.closeCreate();
        this.toast.show('Live creado. Ahora agrega los productos.', 'success');
        void this.router.navigate(['/admin/lives', live.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(
          (err as { status?: number }).status === 409 ? 'Ya existe un Live con ese link. Usa otro.' : errorMessage(err),
        );
      },
    });
  }
}
