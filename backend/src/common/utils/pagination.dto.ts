import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(200) @IsOptional()
  pageSize = 25;

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
