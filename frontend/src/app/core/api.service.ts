import { HttpClient, HttpErrorResponse, HttpEvent, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiErrorBody, CheckoutRequest, City, Department, Live, PaymentMethod, PublicOrder } from './models';

const API = '/api/public';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getLive(slug: string): Observable<Live> {
    return this.http.get<Live>(`${API}/lives/${encodeURIComponent(slug)}`);
  }

  departments(): Observable<Department[]> {
    return this.http.get<Department[]>(`${API}/locations/departments`);
  }

  cities(departmentCode: string): Observable<City[]> {
    return this.http.get<City[]>(`${API}/locations/departments/${departmentCode}/cities`);
  }

  checkout(slug: string, body: CheckoutRequest, idempotencyKey: string): Observable<PublicOrder> {
    return this.http.post<PublicOrder>(`${API}/lives/${encodeURIComponent(slug)}/checkout`, body, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  getOrder(token: string): Observable<PublicOrder> {
    return this.http.get<PublicOrder>(`${API}/orders/${token}`);
  }

  /** Emite eventos de progreso para mostrar la barra de subida en datos móviles. */
  submitPayment(token: string, method: PaymentMethod, receipt: File, reference?: string): Observable<HttpEvent<PublicOrder>> {
    const form = new FormData();
    form.append('method', method);
    if (reference) form.append('reference', reference);
    form.append('receipt', receipt, receipt.name);
    return this.http.post<PublicOrder>(`${API}/orders/${token}/payment`, form, { reportProgress: true, observe: 'events' });
  }
}

/** Mensaje legible para el cliente a partir de cualquier error HTTP. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    if (error.status === 429) return 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.';
    const body = error.error as ApiErrorBody | null;
    if (body?.message) return Array.isArray(body.message) ? body.message.map(cleanValidation).join(' · ') : body.message;
  }
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function errorBody(error: unknown): ApiErrorBody | null {
  return error instanceof HttpErrorResponse ? (error.error as ApiErrorBody | null) : null;
}

/** "customer.Celular inválido..." → "Celular inválido..." */
const cleanValidation = (message: string) => message.replace(/^[a-zA-Z]+(\.\d+)?\./, '');
