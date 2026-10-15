import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustStockDto {
  /** Positivo suma, negativo resta. */
  @IsInt()
  delta: number;

  @IsIn(['RESTOCK', 'ADJUSTMENT'])
  type: 'RESTOCK' | 'ADJUSTMENT';

  @IsString() @MaxLength(300) @IsOptional()
  reason?: string;
}

export class UpdateThresholdDto {
  @IsInt()
  lowStockThreshold: number;
}
