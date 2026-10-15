import { DestroyRef, inject, Injectable } from '@angular/core';
import { Observable, share } from 'rxjs';
import { io } from 'socket.io-client';
import { AuthService } from './auth.service';

export type AdminEventName = 'order.created' | 'order.updated' | 'payment.submitted' | 'batch.updated';

export interface AdminEvent {
  name: AdminEventName;
  payload: Record<string, unknown>;
}

const EVENTS: AdminEventName[] = ['order.created', 'order.updated', 'payment.submitted', 'batch.updated'];

/** Eventos en tiempo real para admins (el JWT va en el handshake). Una sola conexión compartida. */
@Injectable({ providedIn: 'root' })
export class AdminSocketService {
  private readonly auth = inject(AuthService);

  readonly events$: Observable<AdminEvent> = new Observable<AdminEvent>((subscriber) => {
    const socket = io('/realtime', { path: '/socket.io', transports: ['websocket', 'polling'], auth: { token: this.auth.token() } });
    for (const name of EVENTS) socket.on(name, (payload: Record<string, unknown>) => subscriber.next({ name, payload }));
    return () => socket.disconnect();
  }).pipe(share());
}

/** Suscripción atada al ciclo de vida del componente. */
export function onAdminEvents(handler: (event: AdminEvent) => void, filter?: AdminEventName[]): void {
  const sub = inject(AdminSocketService).events$.subscribe((event) => {
    if (!filter || filter.includes(event.name)) handler(event);
  });
  inject(DestroyRef).onDestroy(() => sub.unsubscribe());
}
