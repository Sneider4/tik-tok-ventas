import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.service';
import { OrdersModule } from '../orders/orders.module';
import { MiPaqueteShippingProvider } from './providers/mipaquete.provider';
import { MockShippingProvider } from './providers/mock.provider';
import { SHIPPING_PROVIDER, ShippingProvider } from './providers/shipping-provider.interface';
import { SkydropxShippingProvider } from './providers/skydropx.provider';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [OrdersModule],
  controllers: [ShippingController],
  providers: [
    ShippingService,
    MockShippingProvider,
    MiPaqueteShippingProvider,
    SkydropxShippingProvider,
    {
      provide: SHIPPING_PROVIDER,
      inject: [AppConfig, MockShippingProvider, MiPaqueteShippingProvider, SkydropxShippingProvider],
      useFactory: (
        config: AppConfig,
        mock: MockShippingProvider,
        mipaquete: MiPaqueteShippingProvider,
        skydropx: SkydropxShippingProvider,
      ): ShippingProvider => ({ MOCK: mock, MIPAQUETE: mipaquete, SKYDROPX: skydropx })[config.get('SHIPPING_PROVIDER')],
    },
  ],
})
export class ShippingModule {}
