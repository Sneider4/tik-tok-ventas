import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { PaymentQueryDto, RejectPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('admin/payments')
@UseGuards(AdminAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() query: PaymentQueryDto) {
    return this.payments.list(query);
  }

  /** Los comprobantes son privados: se sirven solo a admins autenticados. */
  @Get(':id/receipt')
  async receipt(@Param('id', ParseUUIDPipe) id: string) {
    const { stream, mimeType } = await this.payments.receipt(id);
    return new StreamableFile(stream, { type: mimeType, disposition: 'inline' });
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.payments.approve(id, admin.sub);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectPaymentDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.payments.reject(id, admin.sub, dto.reason);
  }
}
