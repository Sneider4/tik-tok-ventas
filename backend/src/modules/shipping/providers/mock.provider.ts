import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { renderThermalLabel } from '../labels/thermal-label';
import { ShipmentRequest, ShipmentResult, ShippingProvider } from './shipping-provider.interface';

/**
 * Proveedor de desarrollo: no llama a ninguna API, genera una guía PDF 4x6" real
 * (con número de guía ficticio) para probar el flujo completo y la impresora térmica.
 */
@Injectable()
export class MockShippingProvider implements ShippingProvider {
  readonly code = 'MOCK' as const;

  async createShipment(request: ShipmentRequest): Promise<ShipmentResult> {
    await new Promise((resolve) => setTimeout(resolve, 150)); // Simula latencia de red
    const trackingNumber = `MOCK${Date.now().toString().slice(-8)}${randomInt(100, 999)}`;
    const carrier = 'Transportadora Demo';
    return {
      providerShipmentId: `mock_${request.orderId}`,
      trackingNumber,
      carrier,
      costCop: 11_500,
      labelPdf: await renderThermalLabel({ carrier, trackingNumber, request, watermark: 'GUIA DE PRUEBA - SIN VALIDEZ' }),
      raw: { simulated: true },
    };
  }
}
