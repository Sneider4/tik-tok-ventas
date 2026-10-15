import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ShippingRatePolicy } from './shipping-rate.policy';

@Module({
  imports: [InventoryModule, OrdersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, ShippingRatePolicy],
})
export class CheckoutModule {}
