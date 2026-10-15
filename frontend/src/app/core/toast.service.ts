import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'success';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, kind: Toast['kind'] = 'info', ms = 4000): void {
    const toast = { id: ++this.seq, text, kind };
    this.toasts.update((list) => [...list.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), ms);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
