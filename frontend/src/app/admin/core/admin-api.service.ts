import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { OrderStatus, PaymentStatus } from '../../core/models';
import {
  CreateBatchResponse,
  DashboardSummary,
  InventoryMovement,
  InventoryRow,
  LiveItemInput,
  LiveSessionDetail,
  LiveSessionStatus,
  LiveSessionSummary,
  OrderDetail,
  OrderListItem,
  Paginated,
  PaymentListItem,
  ProductVariant,
  ProductWithVariants,
  ShipmentBatch,
  ShipmentBatchDetail,
  VariantInput,
} from './admin-models';

const API = '/api/admin';

/** Quita parámetros vacíos para no mandar `?search=&status=`. */
function params(values: Record<string, string | number | boolean | undefined | null>): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) p = p.set(key, String(value));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  // ---- Dashboard
  summary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${API}/dashboard/summary`);
  }

  // ---- Pedidos
  orders(query: { status?: OrderStatus[]; search?: string; page?: number; pageSize?: number }): Observable<Paginated<OrderListItem>> {
    return this.http.get<Paginated<OrderListItem>>(`${API}/orders`, {
      params: params({ status: query.status?.join(','), search: query.search, page: query.page, pageSize: query.pageSize }),
    });
  }

  order(id: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`${API}/orders/${id}`);
  }

  cancelOrder(id: string, reason?: string): Observable<OrderDetail> {
    return this.http.post<OrderDetail>(`${API}/orders/${id}/cancel`, { reason });
  }

  markShipped(orderIds: string[]): Observable<{ orderId: string; ok: boolean; error?: string }[]> {
    return this.http.post<{ orderId: string; ok: boolean; error?: string }[]>(`${API}/orders/mark-shipped`, { orderIds });
  }

  markDelivered(orderIds: string[]): Observable<{ orderId: string; ok: boolean; error?: string }[]> {
    return this.http.post<{ orderId: string; ok: boolean; error?: string }[]>(`${API}/orders/mark-delivered`, { orderIds });
  }

  // ---- Pagos
  payments(status: PaymentStatus, page = 1): Observable<Paginated<PaymentListItem>> {
    return this.http.get<Paginated<PaymentListItem>>(`${API}/payments`, { params: params({ status, page, pageSize: 20 }) });
  }

  receipt(paymentId: string): Observable<Blob> {
    return this.http.get(`${API}/payments/${paymentId}/receipt`, { responseType: 'blob' });
  }

  approvePayment(id: string): Observable<{ orderId: string }> {
    return this.http.post<{ orderId: string }>(`${API}/payments/${id}/approve`, {});
  }

  rejectPayment(id: string, reason: string): Observable<{ orderId: string }> {
    return this.http.post<{ orderId: string }>(`${API}/payments/${id}/reject`, { reason });
  }

  // ---- Inventario
  inventory(query: { search?: string; lowStock?: boolean; page?: number }): Observable<Paginated<InventoryRow>> {
    return this.http.get<Paginated<InventoryRow>>(`${API}/inventory`, {
      params: params({ search: query.search, lowStock: query.lowStock, page: query.page, pageSize: 50 }),
    });
  }

  adjustStock(variantId: string, body: { delta: number; type: 'RESTOCK' | 'ADJUSTMENT'; reason?: string }): Observable<InventoryRow> {
    return this.http.post<InventoryRow>(`${API}/inventory/${variantId}/adjust`, body);
  }

  updateThreshold(variantId: string, lowStockThreshold: number): Observable<InventoryRow> {
    return this.http.patch<InventoryRow>(`${API}/inventory/${variantId}/threshold`, { lowStockThreshold });
  }

  movements(variantId: string): Observable<InventoryMovement[]> {
    return this.http.get<InventoryMovement[]>(`${API}/inventory/${variantId}/movements`);
  }

  // ---- Lives
  lives(): Observable<LiveSessionSummary[]> {
    return this.http.get<LiveSessionSummary[]>(`${API}/lives`);
  }

  live(id: string): Observable<LiveSessionDetail> {
    return this.http.get<LiveSessionDetail>(`${API}/lives/${id}`);
  }

  createLive(body: { title: string; slug: string; reservationMinutes?: number }): Observable<LiveSessionSummary> {
    return this.http.post<LiveSessionSummary>(`${API}/lives`, body);
  }

  updateLive(id: string, body: { title?: string; reservationMinutes?: number }): Observable<LiveSessionSummary> {
    return this.http.patch<LiveSessionSummary>(`${API}/lives/${id}`, body);
  }

  setLiveStatus(id: string, status: LiveSessionStatus): Observable<LiveSessionSummary> {
    return this.http.post<LiveSessionSummary>(`${API}/lives/${id}/status`, { status });
  }

  upsertLiveItem(liveId: string, item: LiveItemInput): Observable<LiveSessionDetail> {
    return this.http.put<LiveSessionDetail>(`${API}/lives/${liveId}/items`, item);
  }

  removeLiveItem(liveId: string, variantId: string): Observable<LiveSessionDetail> {
    return this.http.delete<LiveSessionDetail>(`${API}/lives/${liveId}/items/${variantId}`);
  }

  // ---- Catálogo
  products(query: { search?: string; page?: number; pageSize?: number } = {}): Observable<Paginated<ProductWithVariants>> {
    return this.http.get<Paginated<ProductWithVariants>>(`${API}/products`, {
      params: params({ search: query.search, page: query.page, pageSize: query.pageSize ?? 50 }),
    });
  }

  product(id: string): Observable<ProductWithVariants> {
    return this.http.get<ProductWithVariants>(`${API}/products/${id}`);
  }

  createProduct(body: {
    name: string;
    brand?: string;
    description?: string;
    imageUrl?: string;
    variants: VariantInput[];
  }): Observable<ProductWithVariants> {
    return this.http.post<ProductWithVariants>(`${API}/products`, body);
  }

  updateProduct(
    id: string,
    body: { name?: string; brand?: string | null; description?: string | null; imageUrl?: string | null; active?: boolean },
  ): Observable<ProductWithVariants> {
    return this.http.patch<ProductWithVariants>(`${API}/products/${id}`, body);
  }

  addVariant(productId: string, body: VariantInput): Observable<ProductWithVariants> {
    return this.http.post<ProductWithVariants>(`${API}/products/${productId}/variants`, body);
  }

  updateVariant(
    variantId: string,
    body: { name?: string; priceCop?: number; weightGrams?: number; imageUrl?: string | null; active?: boolean },
  ): Observable<ProductVariant> {
    return this.http.patch<ProductVariant>(`${API}/variants/${variantId}`, body);
  }

  // ---- Guías
  createBatch(orderIds: string[]): Observable<CreateBatchResponse> {
    return this.http.post<CreateBatchResponse>(`${API}/shipments/batches`, { orderIds });
  }

  batches(): Observable<ShipmentBatch[]> {
    return this.http.get<ShipmentBatch[]>(`${API}/shipments/batches`);
  }

  batch(id: string): Observable<ShipmentBatchDetail> {
    return this.http.get<ShipmentBatchDetail>(`${API}/shipments/batches/${id}`);
  }

  batchLabels(id: string): Observable<Blob> {
    return this.http.get(`${API}/shipments/batches/${id}/labels.pdf`, { responseType: 'blob' });
  }

  shipmentLabel(shipmentId: string): Observable<Blob> {
    return this.http.get(`${API}/shipments/${shipmentId}/label.pdf`, { responseType: 'blob' });
  }
}

/**
 * Abre un PDF protegido (requiere JWT, así que no sirve un <a href>) en una pestaña nueva
 * para imprimir; si el navegador bloquea la ventana, lo descarga.
 */
export function openPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
