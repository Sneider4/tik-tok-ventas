import { Body, Controller, Get, Param, ParseUUIDPipe, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { ShippingService } from './shipping.service';

class CreateBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @IsUUID('all', { each: true })
  orderIds: string[];
}

@Controller('admin/shipments')
@UseGuards(AdminAuthGuard)
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('batches')
  createBatch(@Body() dto: CreateBatchDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.shipping.createBatch(dto.orderIds, admin.sub);
  }

  @Get('batches')
  listBatches() {
    return this.shipping.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipping.getBatch(id);
  }

  /** Un solo PDF con todas las guías del lote, listo para la impresora térmica. */
  @Get('batches/:id/labels.pdf')
  async batchLabels(@Param('id', ParseUUIDPipe) id: string) {
    return new StreamableFile(await this.shipping.batchLabels(id), {
      type: 'application/pdf',
      disposition: `inline; filename="guias-${id.slice(0, 8)}.pdf"`,
    });
  }

  @Get(':id/label.pdf')
  async label(@Param('id', ParseUUIDPipe) id: string) {
    return new StreamableFile(await this.shipping.shipmentLabel(id), {
      type: 'application/pdf',
      disposition: `inline; filename="guia-${id.slice(0, 8)}.pdf"`,
    });
  }
}
