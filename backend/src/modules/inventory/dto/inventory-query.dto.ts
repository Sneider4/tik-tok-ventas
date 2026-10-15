import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';

export class InventoryQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional()
  search?: string;

  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean() @IsOptional()
  lowStock?: boolean;
}
