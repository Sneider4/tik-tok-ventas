import { local } from './storage';

export interface RecentOrder {
  token: string;
  code: string;
  totalCop: number;
  createdAt: string;
}

const KEY = 'recent-orders';

/** Pedidos hechos desde este celular, para volver al seguimiento sin buscar el link. */
export const recentOrders = {
  list: (): RecentOrder[] => local.get<RecentOrder[]>(KEY, []),
  add(order: RecentOrder): void {
    const others = recentOrders.list().filter((o) => o.token !== order.token);
    local.set(KEY, [order, ...others].slice(0, 10));
  },
};
