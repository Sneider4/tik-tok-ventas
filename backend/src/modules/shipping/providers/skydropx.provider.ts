import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.service';
import { ShipmentRequest, ShipmentResult, ShippingProvider, ShippingProviderError } from './shipping-provider.interface';

/**
 * Adaptador Skydropx.
 *
 * ⚠️ ESQUELETO — pendiente de implementar contra la API vigente de tu cuenta
 * (autenticación OAuth client_credentials → cotización → selección de tarifa → envío → etiqueta).
 * Se deja registrado para que la selección por variable de entorno ya funcione y
 * falle con un mensaje claro en vez de silenciosamente.
 */
@Injectable()
export class SkydropxShippingProvider implements ShippingProvider {
  readonly code = 'SKYDROPX' as const;

  constructor(private readonly config: AppConfig) {}

  async createShipment(_request: ShipmentRequest): Promise<ShipmentResult> {
    if (!this.config.get('SKYDROPX_BASE_URL') || !this.config.get('SKYDROPX_CLIENT_ID')) {
      throw new ShippingProviderError('Skydropx no está configurado (SKYDROPX_BASE_URL / SKYDROPX_CLIENT_ID / SKYDROPX_CLIENT_SECRET)');
    }
    // TODO: 1) POST token OAuth  2) crear cotización  3) elegir tarifa  4) crear envío  5) descargar etiqueta 4x6
    throw new ShippingProviderError('Integración Skydropx pendiente de implementar');
  }
}
