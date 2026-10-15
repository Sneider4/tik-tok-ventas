import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, SubmitPaymentDto } from './dto/checkout.dto';

/** API pública (sin login) consumida por el checkout móvil. */
@Controller('public')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('lives/:slug')
  getLive(@Param('slug') slug: string) {
    return this.checkout.getLive(slug);
  }

  /**
   * El frontend genera un UUID por intento de compra y lo manda en `Idempotency-Key`:
   * si el usuario toca "Confirmar" dos veces o la red reintenta, se devuelve el mismo pedido.
   */
  @Post('lives/:slug/checkout')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Param('slug') slug: string,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkout.createOrder(slug, dto, idempotencyKey?.slice(0, 100) || undefined);
  }

  @Get('orders/:token')
  getOrder(@Param('token', ParseUUIDPipe) token: string) {
    return this.checkout.getPublicOrder(token);
  }

  @Post('orders/:token/payment')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  submitPayment(
    @Param('token', ParseUUIDPipe) token: string,
    @Body() dto: SubmitPaymentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.checkout.submitPayment(token, dto, file);
  }
}
