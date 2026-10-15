/** Contratos de la API pública (backend/src/modules/checkout). */

export type LiveStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';
export type DocumentType = 'CC' | 'CE' | 'TI' | 'PP' | 'PPT' | 'NIT';
export type PaymentMethod = 'NEQUI' | 'DAVIPLATA' | 'BANK_TRANSFER' | 'OTHER';
export type PaymentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_REVIEW'
  | 'PAID'
  | 'LABEL_GENERATED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface PaymentInstructions {
  accountHolder: string;
  nequi: string;
  daviplata: string;
  bank: string;
}

export interface LiveItem {
  variantId: string;
  sku: string;
  productName: string;
  brand: string | null;
  variantName: string;
  imageUrl: string | null;
  priceCop: number;
  regularPriceCop: number;
  maxPerOrder: number;
  available: number;
}

export interface Live {
  id: string;
  slug: string;
  title: string;
  status: LiveStatus;
  checkoutOpen: boolean;
  reservationMinutes: number;
  shipping: { flatCop: number; freeFromCop: number | null };
  payment: PaymentInstructions;
  items: LiveItem[];
}

export interface Department {
  code: string;
  name: string;
}

export interface City {
  code: string;
  name: string;
}

export interface CheckoutRequest {
  items: { variantId: string; quantity: number }[];
  customer: {
    fullName: string;
    documentType: DocumentType;
    documentNumber: string;
    phone: string;
    email?: string;
    tiktokUsername?: string;
  };
  shipping: {
    cityCode: string;
    addressLine: string;
    neighborhood?: string;
    additionalInfo?: string;
  };
  notes?: string;
  acceptsDataPolicy: boolean;
}

export interface PublicOrder {
  id: string;
  publicToken: string;
  code: string;
  status: OrderStatus;
  createdAt: string;
  reservedUntil: string | null;
  items: { productName: string; variantName: string; quantity: number; unitPriceCop: number; lineTotalCop: number }[];
  subtotalCop: number;
  shippingCop: number;
  discountCop: number;
  totalCop: number;
  shipping: { fullName: string; city: string; addressLine: string };
  lastPayment: { status: PaymentStatus; method: PaymentMethod; rejectionReason: string | null; createdAt: string } | null;
  shipment: { carrier: string | null; trackingNumber: string | null; status: string } | null;
  payment?: PaymentInstructions;
}

export interface OutOfStockItem {
  variantId: string;
  requested: number;
  available: number;
}

/** Forma de los errores que devuelve NestJS. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  code?: string;
  items?: OutOfStockItem[];
}
