import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdjustStockDto, UpdateThresholdDto } from './dto/adjust-stock.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { InventoryService } from './inventory.service';

@Controller('admin/inventory')
@UseGuards(AdminAuthGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query() query: InventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Get(':variantId')
  get(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventory.getItem(variantId);
  }

  @Get(':variantId/movements')
  movements(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventory.movements(variantId);
  }

  @Post(':variantId/adjust')
  adjust(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.inventory.adjust(variantId, dto.delta, dto.type, admin.sub, dto.reason);
  }

  @Patch(':variantId/threshold')
  async threshold(@Param('variantId', ParseUUIDPipe) variantId: string, @Body() dto: UpdateThresholdDto) {
    await this.prisma.inventoryItem.update({ where: { variantId }, data: { lowStockThreshold: dto.lowStockThreshold } });
    return this.inventory.getItem(variantId);
  }
}
