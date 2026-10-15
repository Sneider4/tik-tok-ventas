import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'live/:slug',
    title: 'Compra del Live',
    loadComponent: () => import('./checkout/live-page/live-page').then((m) => m.LivePage),
  },
  {
    path: 'live/:slug/datos',
    title: 'Datos de envío',
    loadComponent: () => import('./checkout/shipping-page/shipping-page').then((m) => m.ShippingPage),
  },
  {
    path: 'pedido/:token',
    title: 'Tu pedido',
    loadComponent: () => import('./checkout/order-page/order-page').then((m) => m.OrderPage),
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '',
    title: 'Mis pedidos',
    loadComponent: () => import('./checkout/home-page/home-page').then((m) => m.HomePage),
  },
  { path: '**', redirectTo: '' },
];
