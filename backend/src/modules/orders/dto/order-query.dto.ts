import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';

export class OrderQueryDto extends PaginationQueryDto {
  /** Uno o varios estados separados por coma: ?status=PAID,LABEL_GENERATED */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsEnum(OrderStatus, { each: true }) @IsOptional()
  status?: OrderStatus[];

  /** Busca por número de pedido, nombre, teléfono o documento. */
  @IsString() @MaxLength(80) @IsOptional()
  search?: string;

  @IsUUID() @IsOptional()
  liveSessionId?: string;

  @IsISO8601() @IsOptional()
  from?: string;

  @IsISO8601() @IsOptional()
  to?: string;
}

export class CancelOrderDto {
  @IsString() @MaxLength(300) @IsOptional()
  reason?: string;
}
