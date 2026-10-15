import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { local } from '../../core/storage';
import { AdminUser, LoginResponse } from './admin-models';

const SESSION_KEY = 'admin-session';

interface Session {
  token: string;
  admin: AdminUser;
}

/** Lee la expiración del JWT (sin verificar firma: eso lo hace el backend). */
function tokenExpiresAt(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<Session | null>(this.restore());

  readonly admin = computed(() => this.session()?.admin ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isLoggedIn = computed(() => {
    const token = this.token();
    return !!token && tokenExpiresAt(token) > Date.now();
  });

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap(({ accessToken, admin }) => {
        const session = { token: accessToken, admin };
        this.session.set(session);
        local.set(SESSION_KEY, session);
      }),
    );
  }

  logout(redirect = true): void {
    this.session.set(null);
    local.remove(SESSION_KEY);
    if (redirect) void this.router.navigate(['/admin/login']);
  }

  private restore(): Session | null {
    const saved = local.get<Session | null>(SESSION_KEY, null);
    return saved && tokenExpiresAt(saved.token) > Date.now() ? saved : null;
  }
}
