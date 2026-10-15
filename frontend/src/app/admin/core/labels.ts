import { OrderStatus, PaymentMethod, PaymentStatus } from '../../core/models';

/** Textos y colores (clases .badge--*) para mostrar estados en el panel. */
export const ORDER_STATUS: Record<OrderStatus, { label: string; badge: string }> = {
  PENDING_PAYMENT: { label: 'Esperando pago', badge: 'badge--warn' },
  PAYMENT_REVIEW: { label: 'Revisar pago', badge: 'badge--soft' },
  PAID: { label: 'Pagado', badge: 'badge--success' },
  LABEL_GENERATED: { label: 'Con guía', badge: 'badge--info' },
  SHIPPED: { label: 'Enviado', badge: 'badge--info' },
  DELIVERED: { label: 'Entregado', badge: 'badge--muted' },
  CANCELLED: { label: 'Cancelado', badge: 'badge--danger' },
  EXPIRED: { label: 'Expirado', badge: 'badge--muted' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  BANK_TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; badge: string }> = {
  PENDING_REVIEW: { label: 'Por revisar', badge: 'badge--warn' },
  APPROVED: { label: 'Aprobado', badge: 'badge--success' },
  REJECTED: { label: 'Rechazado', badge: 'badge--danger' },
};

export const SHIPMENT_STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Generando', badge: 'badge--warn' },
  LABEL_CREATED: { label: 'Guía lista', badge: 'badge--success' },
  IN_TRANSIT: { label: 'En tránsito', badge: 'badge--info' },
  DELIVERED: { label: 'Entregada', badge: 'badge--muted' },
  FAILED: { label: 'Falló', badge: 'badge--danger' },
  CANCELLED: { label: 'Anulada', badge: 'badge--danger' },
};

export const LIVE_STATUS: Record<'SCHEDULED' | 'LIVE' | 'ENDED', { label: string; badge: string }> = {
  SCHEDULED: { label: 'Programado', badge: 'badge--muted' },
  LIVE: { label: 'EN VIVO', badge: 'badge--live' },
  ENDED: { label: 'Finalizado', badge: 'badge--info' },
};

/** "Live de Halloween 🎃 ¡50% OFF!" → "live-de-halloween-50-off" (formato que acepta el backend). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** "Labial Matte" + "Tono 05 Rojo" → "LAB-MAT-05" (sugerencia editable). */
export function suggestSku(productName: string, variantName: string): string {
  const clean = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // Se omiten conectores cortos ("en", "de", "la") para que "Rubor en Crema" → "RUB-CRE".
  const words = clean(productName).split(/[^A-Z0-9]+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w.slice(0, 3));
  const variant = clean(variantName);
  const tail = variant.match(/\d+/)?.[0] ?? variant.split(/[^A-Z0-9]+/).filter(Boolean).map((w) => w.slice(0, 3)).join('').slice(0, 6);
  return [...words, tail].filter(Boolean).join('-').slice(0, 40);
}

export const MOVEMENT_TYPE: Record<string, string> = {
  RESTOCK: 'Entrada',
  ADJUSTMENT: 'Ajuste',
  RESERVE: 'Reserva',
  RELEASE: 'Liberación',
  SALE: 'Venta',
  RETURN: 'Devolución',
};
