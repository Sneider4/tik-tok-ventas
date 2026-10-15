import { ShippingProviderCode } from '@prisma/client';

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');

export interface ShipmentParty {
  fullName: string;
  phone: string;
  document?: string;
  cityCode: string; // DANE 5 dígitos
  cityName?: string;
  departmentName?: string;
  addressLine: string;
  neighborhood?: string | null;
  additionalInfo?: string | null;
}

export interface ShipmentRequest {
  orderId: string;
  orderCode: string;
  declaredValueCop: number;
  /** Valor a recaudar contra entrega. 0 = ya pagado (nuestro caso: pago previo). */
  collectOnDeliveryCop: number;
  weightGrams: number;
  units: number;
  contentDescription: string;
  sender: ShipmentParty;
  recipient: ShipmentParty;
}

export interface ShipmentResult {
  providerShipmentId: string;
  trackingNumber: string;
  carrier: string;
  costCop?: number;
  /** PDF de la guía en formato 4x6" (100x150 mm) para impresora térmica. */
  labelPdf: Buffer;
  raw?: unknown;
}

/**
 * Contrato que cumple cualquier agregador logístico (MiPaquete, Skydropx...).
 * El resto del sistema solo conoce esta interfaz: cambiar de proveedor es cambiar una variable de entorno.
 */
export interface ShippingProvider {
  readonly code: ShippingProviderCode;
  createShipment(request: ShipmentRequest): Promise<ShipmentResult>;
}

export class ShippingProviderError extends Error {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
  }
}
