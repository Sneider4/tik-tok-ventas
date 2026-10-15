import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  auth.logout(false);
  return inject(Router).createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};
