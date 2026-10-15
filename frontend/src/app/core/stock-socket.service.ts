import { DestroyRef, inject, Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, share } from 'rxjs';

export interface StockUpdate {
  variantId: string;
  available: number;
}

/**
 * Stock en vivo: el backend emite `stock.updated` cada vez que alguien reserva,
 * se vence una reserva o el admin ajusta inventario.
 */
@Injectable({ providedIn: 'root' })
export class StockSocketService {
  readonly updates$: Observable<StockUpdate[]> = new Observable<StockUpdate[]>((subscriber) => {
    const socket: Socket = io('/realtime', { path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('stock.updated', (updates: StockUpdate[]) => subscriber.next(updates));
    return () => socket.disconnect();
  }).pipe(share());
}

/** Helper para componentes: se desuscribe solo al destruir el componente. */
export function onStockUpdates(handler: (updates: StockUpdate[]) => void): void {
  const subscription = inject(StockSocketService).updates$.subscribe(handler);
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
}
