import { Routes } from '@angular/router';
import { adminGuard } from './core/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'login',
    title: 'Ingresar · Panel',
    loadComponent: () => import('./pages/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', title: 'Inicio · Panel', loadComponent: () => import('./pages/dashboard-page').then((m) => m.DashboardPage) },
      { path: 'pagos', title: 'Comprobantes · Panel', loadComponent: () => import('./pages/payments-page/payments-page').then((m) => m.PaymentsPage) },
      { path: 'pedidos', title: 'Pedidos · Panel', loadComponent: () => import('./pages/orders-page/orders-page').then((m) => m.OrdersPage) },
      { path: 'inventario', title: 'Inventario · Panel', loadComponent: () => import('./pages/inventory-page/inventory-page').then((m) => m.InventoryPage) },
      { path: 'guias', title: 'Guías · Panel', loadComponent: () => import('./pages/batches-page/batches-page').then((m) => m.BatchesPage) },
      { path: 'lives', title: 'Lives · Panel', loadComponent: () => import('./pages/lives-page/lives-page').then((m) => m.LivesPage) },
      { path: 'lives/:id', title: 'Live · Panel', loadComponent: () => import('./pages/lives-page/live-detail-page').then((m) => m.LiveDetailPage) },
      { path: 'productos', title: 'Productos · Panel', loadComponent: () => import('./pages/products-page/products-page').then((m) => m.ProductsPage) },
      { path: 'productos/nuevo', title: 'Nuevo producto · Panel', loadComponent: () => import('./pages/products-page/product-form-page').then((m) => m.ProductFormPage) },
      { path: 'productos/:id', title: 'Producto · Panel', loadComponent: () => import('./pages/products-page/product-form-page').then((m) => m.ProductFormPage) },
      { path: 'guias/:id', title: 'Lote de guías · Panel', loadComponent: () => import('./pages/batches-page/batch-detail-page').then((m) => m.BatchDetailPage) },
    ],
  },
];
