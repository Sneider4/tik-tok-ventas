import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Agrega el JWT a las llamadas /api/admin y /api/auth/me; si el token venció, vuelve al login. */
export const adminAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const needsAuth = req.url.startsWith('/api/admin') || req.url.startsWith('/api/auth/me');
  if (!needsAuth) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.logout(false);
        void router.navigate(['/admin/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
