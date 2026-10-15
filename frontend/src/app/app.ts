import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <div class="toasts" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <button type="button" [class]="'toast toast--' + toast.kind" (click)="toasts.dismiss(toast.id)">
          {{ toast.text }}
        </button>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
