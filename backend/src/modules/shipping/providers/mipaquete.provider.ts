import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.service';
import { ShipmentRequest, ShipmentResult, ShippingProvider, ShippingProviderError } from './shipping-provider.interface';

/**
 * Adaptador MiPaquete (agregador colombiano: Servientrega, Coordinadora, Interrapidísimo, TCC...).
 *
 * ⚠️ ESQUELETO — verificar contra la documentación oficial y el sandbox de tu cuenta antes
 * de activarlo (SHIPPING_PROVIDER=MIPAQUETE). Los nombres de endpoints y campos marcados con
 * TODO son el punto de partida, no un contrato confirmado.
 *
 * Flujo típico de estos agregadores:
 *   1. Cotizar  → elegir transportadora (la más barata o la preferida para esa ciudad).
 *   2. Crear envío con la cotización elegida → devuelve id + número de guía.
 *   3. Descargar el PDF de la guía (a veces llega asíncrono: reintentar unos segundos).
 */
@Injectable()
export class MiPaqueteShippingProvider implements ShippingProvider {
  readonly code = 'MIPAQUETE' as const;
  private readonly logger = new Logger(MiPaqueteShippingProvider.name);

  constructor(private readonly config: AppConfig) {}

  async createShipment(request: ShipmentRequest): Promise<ShipmentResult> {
    const quote = await this.call<{ deliveryCompanyId: string; deliveryCompanyName: string; shippingCost: number }[]>(
      'POST',
      '/quoteShipping', // TODO: confirmar endpoint
      {
        originLocationCode: request.sender.cityCode, // DANE
        destinyLocationCode: request.recipient.cityCode, // DANE
        height: 10, width: 15, length: 20, // TODO: dimensiones reales por tipo de empaque
        weight: Math.max(1, Math.ceil(request.weightGrams / 1000)),
        quantity: 1,
        declaredValue: request.declaredValueCop,
        saleValue: request.collectOnDeliveryCop,
      },
    );
    const best = [...quote].sort((a, b) => a.shippingCost - b.shippingCost)[0];
    if (!best) throw new ShippingProviderError('Sin transportadoras disponibles para este destino', quote);

    const created = await this.call<{ mpCode: string; guideNumber?: string }>('POST', '/createSending', {
      // TODO: confirmar nombres de campos
      sender: this.party(request.sender),
      receiver: this.party(request.recipient),
      productInformation: {
        quantity: 1,
        weight: Math.max(1, Math.ceil(request.weightGrams / 1000)),
        declaredValue: request.declaredValueCop,
        description: request.contentDescription.slice(0, 100),
      },
      deliveryCompany: best.deliveryCompanyId,
      paymentType: 101, // TODO: código de "pago con saldo de la cuenta"
      valueCollection: request.collectOnDeliveryCop,
      comments: request.orderCode,
    });

    const labelPdf = await this.downloadLabel(created.mpCode);
    return {
      providerShipmentId: created.mpCode,
      trackingNumber: created.guideNumber ?? created.mpCode,
      carrier: best.deliveryCompanyName,
      costCop: Math.round(best.shippingCost),
      labelPdf,
      raw: { quote: best, created },
    };
  }

  private async downloadLabel(mpCode: string): Promise<Buffer> {
    // La guía puede tardar unos segundos en estar lista en la transportadora.
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await this.call<{ pdf?: string; url?: string }>('POST', '/getSendingLabel', { mpCode }); // TODO: confirmar
      if (res.pdf) return Buffer.from(res.pdf, 'base64');
      if (res.url) return Buffer.from(await (await fetch(res.url)).arrayBuffer());
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
    throw new ShippingProviderError(`Guía ${mpCode} creada pero el PDF no estuvo disponible; reintentar descarga`);
  }

  private party(p: ShipmentRequest['recipient']) {
    return {
      name: p.fullName,
      cellPhone: p.phone,
      nit: p.document,
      locationCode: p.cityCode,
      address: [p.addressLine, p.neighborhood, p.additionalInfo].filter(Boolean).join(', '),
    };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const baseUrl = this.config.get('MIPAQUETE_BASE_URL');
    const apiKey = this.config.get('MIPAQUETE_API_KEY');
    if (!baseUrl || !apiKey) throw new ShippingProviderError('MiPaquete no está configurado (MIPAQUETE_BASE_URL / MIPAQUETE_API_KEY)');

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: apiKey }, // TODO: confirmar header de autenticación
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      this.logger.warn(`MiPaquete ${path} → ${res.status}`);
      throw new ShippingProviderError(`MiPaquete respondió ${res.status}`, payload);
    }
    return payload as T;
  }
}
