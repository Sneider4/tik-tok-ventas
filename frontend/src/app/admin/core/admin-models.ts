import { OrderStatus, PaymentMethod, PaymentStatus } from '../../core/models';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR';
}

export interface LoginResponse {
  accessToken: string;
  admin: AdminUser;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummary {
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  today: { ordersCreated: number; ordersPaid: number; salesCop: number };
  pendingPayments: number;
  lowStockVariants: number;
}

export interface OrderListItem {
  id: string;
  number: number;
  code: string;
  status: OrderStatus;
  totalCop: number;
  createdAt: string;
  reservedUntil: string | null;
  shipFullName: string;
  shipPhone: string;
  shipCityName: string;
  shipDepartmentName: string;
  units: number;
  customer: { fullName: string; phone: string };
  shipment: { status: string; trackingNumber: string | null; carrier: string | null } | null;
  lastPayment: { id: string; status: PaymentStatus; method: PaymentMethod } | null;
}

export interface OrderDetail extends OrderListItem {
  subtotalCop: number;
  shippingCop: number;
  discountCop: number;
  shipAddressLine: string;
  shipNeighborhood: string | null;
  shipAdditionalInfo: string | null;
  customerNotes: string | null;
  paidAt: string | null;
  customer: {
    fullName: string;
    phone: string;
    email: string | null;
    documentType: string;
    documentNumber: string;
    tiktokUsername: string | null;
  };
  liveSession: { id: string; title: string; slug: string } | null;
  items: { id: string; sku: string; productName: string; variantName: string; quantity: number; unitPriceCop: number; lineTotalCop: number }[];
  payments: {
    id: string;
    method: PaymentMethod;
    amountCop: number;
    reference: string | null;
    status: PaymentStatus;
    rejectionReason: string | null;
    createdAt: string;
    receiptMimeType: string;
  }[];
  shipment: {
    id: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    labelPath: string | null;
    errorMessage: string | null;
  } | null;
  history: { id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; createdAt: string; adminUser: { fullName: string } | null }[];
}

export interface PaymentListItem {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amountCop: number;
  reference: string | null;
  receiptMimeType: string;
  status: PaymentStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reviewedBy: { fullName: string } | null;
  order: {
    id: string;
    code: string;
    totalCop: number;
    status: OrderStatus;
    shipFullName: string;
    shipPhone: string;
    items: { productName: string; variantName: string; quantity: number }[];
  };
}

export interface InventoryRow {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  updatedAt: string;
  variant: {
    id: string;
    sku: string;
    name: string;
    priceCop: number;
    active: boolean;
    product: { id: string; name: string; brand: string | null };
  };
}

export interface InventoryMovement {
  id: string;
  type: 'RESTOCK' | 'ADJUSTMENT' | 'RESERVE' | 'RELEASE' | 'SALE' | 'RETURN';
  deltaOnHand: number;
  deltaReserved: number;
  reason: string | null;
  orderId: string | null;
  createdAt: string;
  adminUser: { fullName: string } | null;
}

export type BatchStatus = 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface ShipmentBatch {
  id: string;
  provider: string;
  status: BatchStatus;
  totalOrders: number;
  succeeded: number;
  failed: number;
  mergedLabelPath: string | null;
  createdAt: string;
  completedAt: string | null;
  createdBy: { fullName: string };
}

export interface ShipmentBatchDetail extends ShipmentBatch {
  shipments: {
    id: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    labelPath: string | null;
    costCop: number | null;
    errorMessage: string | null;
    order: { id: string; code: string; shipFullName: string; shipCityName: string; status: OrderStatus };
  }[];
}

// ---- Lives

export type LiveSessionStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';

export interface LiveSessionSummary {
  id: string;
  slug: string;
  title: string;
  status: LiveSessionStatus;
  startsAt: string | null;
  endedAt: string | null;
  reservationMinutes: number;
  createdAt: string;
  _count: { orders: number; items: number };
}

export interface LiveSessionItem {
  id: string;
  variantId: string;
  livePriceCop: number | null;
  maxPerOrder: number;
  displayOrder: number;
  active: boolean;
  variant: ProductVariant & { product: Product };
}

export interface LiveSessionDetail extends Omit<LiveSessionSummary, '_count'> {
  items: LiveSessionItem[];
}

export interface LiveItemInput {
  variantId: string;
  livePriceCop?: number | null;
  maxPerOrder?: number;
  displayOrder?: number;
  active?: boolean;
}

// ---- Catálogo

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  priceCop: number;
  weightGrams: number;
  imageUrl: string | null;
  active: boolean;
  inventory: { onHand: number; reserved: number; lowStockThreshold: number } | null;
}

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

export interface VariantInput {
  sku: string;
  name: string;
  priceCop: number;
  weightGrams?: number;
  imageUrl?: string;
  initialStock?: number;
  lowStockThreshold?: number;
}

export interface CreateBatchResponse {
  batch: ShipmentBatch;
  skipped: { orderId: string; code: string | null; reason: string }[];
}
