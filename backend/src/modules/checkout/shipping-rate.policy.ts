import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.service';

/**
 * Costo de envío que paga el cliente. Hoy: tarifa plana con envío gratis desde un monto.
 * Para cobrar el valor real por ciudad, reemplazar por una cotización al ShippingProvider.
 */
@Injectable()
export class ShippingRatePolicy {
  constructor(private readonly config: AppConfig) {}

  costFor(subtotalCop: number, _cityCode: string): number {
    const freeFrom = this.config.get('FREE_SHIPPING_FROM_COP');
    if (freeFrom > 0 && subtotalCop >= freeFrom) return 0;
    return this.config.get('SHIPPING_FLAT_COP');
  }

  describe() {
    return {
      flatCop: this.config.get('SHIPPING_FLAT_COP'),
      freeFromCop: this.config.get('FREE_SHIPPING_FROM_COP') || null,
    };
  }
}
