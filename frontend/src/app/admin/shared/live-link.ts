import { inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';

/** Link público del checkout de un Live (el que se pega en TikTok). */
export const liveUrl = (slug: string): string => `${location.origin}/live/${slug}`;

/** Devuelve una función que copia el link y avisa con un toast. Llamar en contexto de inyección. */
export function injectCopyLiveLink(): (slug: string) => Promise<void> {
  const toast = inject(ToastService);
  return async (slug: string) => {
    try {
      await navigator.clipboard.writeText(liveUrl(slug));
      toast.show('🔗 Link copiado. Pégalo en el chat del Live o en tu bio.', 'success', 3000);
    } catch {
      toast.show(`No se pudo copiar automáticamente: ${liveUrl(slug)}`, 'warn', 8000);
    }
  };
}
