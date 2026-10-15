import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { CancelOrderDto, OrderQueryDto } from './dto/order-query.dto';
import { OrdersService } from './orders.service';

class OrderIdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true })
  orderIds: string[];
}

@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: OrderQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.orders.cancel(id, admin.sub, dto.reason);
  }

  @Post('mark-shipped')
  markShipped(@Body() dto: OrderIdsDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.orders.markShipped(dto.orderIds, admin.sub);
  }

  @Post('mark-delivered')
  markDelivered(@Body() dto: OrderIdsDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.orders.markDelivered(dto.orderIds, admin.sub);
  }
}
