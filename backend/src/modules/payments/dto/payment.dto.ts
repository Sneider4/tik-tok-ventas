import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';

export class PaymentQueryDto extends PaginationQueryDto {
  @IsEnum(PaymentStatus) @IsOptional()
  status?: PaymentStatus;
}

export class RejectPaymentDto {
  /** Se le muestra al cliente: "El monto no coincide", "Comprobante ilegible"... */
  @IsString() @MinLength(3) @MaxLength(300)
  reason: string;
}
