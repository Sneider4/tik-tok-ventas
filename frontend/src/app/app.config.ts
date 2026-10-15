import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { adminAuthInterceptor } from './admin/core/auth.interceptor';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Backend XHR (no fetch) para tener progreso de subida del comprobante.
    provideHttpClient(withInterceptors([adminAuthInterceptor])),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    { provide: LOCALE_ID, useValue: 'es-CO' },
  ],
};
