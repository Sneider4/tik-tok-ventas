import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LiveSessionStatus } from '@prisma/client';

export class CreateLiveSessionDto {
  @IsString() @MaxLength(120)
  title: string;

  /** Va en el link público: /live/<slug>. */
  @IsString() @Matches(/^[a-z0-9-]{3,60}$/, { message: 'slug: minúsculas, números y guiones (3-60)' })
  slug: string;

  @IsDateString() @IsOptional()
  startsAt?: string;

  @IsInt() @Min(5) @Max(24 * 60) @IsOptional()
  reservationMinutes?: number;
}

export class UpdateLiveSessionDto {
  @IsString() @MaxLength(120) @IsOptional()
  title?: string;

  @IsDateString() @IsOptional()
  startsAt?: string;

  @IsInt() @Min(5) @Max(24 * 60) @IsOptional()
  reservationMinutes?: number;
}

export class ChangeLiveStatusDto {
  @IsEnum(LiveSessionStatus)
  status: LiveSessionStatus;
}

export class UpsertLiveItemDto {
  @IsUUID()
  variantId: string;

  @Type(() => Number) @IsInt() @Min(0) @IsOptional()
  livePriceCop?: number | null;

  @IsInt() @Min(1) @Max(50) @IsOptional()
  maxPerOrder?: number;

  @IsInt() @IsOptional()
  displayOrder?: number;

  @IsBoolean() @IsOptional()
  active?: boolean;
}
