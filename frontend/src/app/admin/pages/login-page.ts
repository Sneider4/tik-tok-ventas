import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="login">
      <form class="login__card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="login__brand">
          <span class="login__logo" aria-hidden="true">💄</span>
          <div>
            <h1>Panel de pedidos</h1>
            <p class="muted small">Live Commerce · Administración</p>
          </div>
        </div>

        <label class="field">
          <span class="field__label">Correo</span>
          <input class="input" type="email" formControlName="email" autocomplete="username" autofocus />
        </label>
        <label class="field">
          <span class="field__label">Contraseña</span>
          <input class="input" type="password" formControlName="password" autocomplete="current-password" />
        </label>

        @if (error()) {
          <p class="alert alert--danger" role="alert">{{ error() }}</p>
        }

        <button class="btn btn--primary btn--block" type="submit" [disabled]="loading()">
          @if (loading()) {
            <span class="spinner"></span>
          }
          Entrar
        </button>
      </form>
    </main>
  `,
  styles: `
    .login { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
    .login__card { width: 100%; max-width: 380px; display: grid; gap: 16px; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 28px 24px; }
    .login__brand { display: flex; gap: 12px; align-items: center; margin-bottom: 4px; }
    .login__brand h1 { font-size: 20px; font-weight: 800; }
    .login__brand p { margin: 2px 0 0; }
    .login__logo { width: 44px; height: 44px; border-radius: 12px; background: var(--brand-soft); display: grid; place-items: center; font-size: 22px; }
    .alert { margin: 0; }
  `,
})
export class LoginPage {
  readonly returnUrl = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.error.set('Escribe tu correo y contraseña.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  /** Solo rutas internas del panel (evita redirecciones abiertas). */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/admin') && !url.startsWith('/admin/login') ? url : '/admin';
  }
}
