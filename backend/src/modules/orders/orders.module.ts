import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderExpirationJob } from './order-expiration.job';
import { OrderStateService } from './order-state.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateService, OrderExpirationJob],
  exports: [OrdersService, OrderStateService],
})
export class OrdersModule {}
