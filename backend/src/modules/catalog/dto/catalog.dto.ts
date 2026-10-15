import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';

export class CreateVariantDto {
  @IsString() @Matches(/^[A-Z0-9-]{3,40}$/, { message: 'SKU: mayúsculas, números y guiones (3-40)' })
  sku: string;

  @IsString() @MaxLength(120)
  name: string;

  @IsInt() @Min(0)
  priceCop: number;

  @IsInt() @Min(1) @IsOptional()
  weightGrams?: number;

  @IsUrl() @IsOptional()
  imageUrl?: string;

  /** Stock inicial (se registra como RESTOCK en el kardex). */
  @IsInt() @Min(0) @IsOptional()
  initialStock?: number;

  @IsInt() @Min(0) @IsOptional()
  lowStockThreshold?: number;
}

export class UpdateVariantDto {
  @IsString() @MaxLength(120) @IsOptional()
  name?: string;

  @IsInt() @Min(0) @IsOptional()
  priceCop?: number;

  @IsInt() @Min(1) @IsOptional()
  weightGrams?: number;

  @IsUrl() @IsOptional()
  imageUrl?: string;

  @IsBoolean() @IsOptional()
  active?: boolean;
}

export class CreateProductDto {
  @IsString() @MaxLength(120)
  name: string;

  @IsString() @MaxLength(80) @IsOptional()
  brand?: string;

  @IsString() @MaxLength(2000) @IsOptional()
  description?: string;

  @IsUrl() @IsOptional()
  imageUrl?: string;

  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreateVariantDto) @IsOptional()
  variants?: CreateVariantDto[];
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['variants'] as const)) {
  @IsBoolean() @IsOptional()
  active?: boolean;
}

export class ProductQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional()
  search?: string;
}
