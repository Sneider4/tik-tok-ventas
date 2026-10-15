import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @Type(() => Number) @IsInt() @IsOptional()
  PORT = 3000;

  @IsString() @IsOptional()
  NODE_ENV = 'development';

  @IsString() @IsOptional()
  CORS_ORIGINS = 'http://localhost:4200';

  @IsString() @IsNotEmpty()
  DATABASE_URL: string;

  @IsString() @MinLength(16)
  JWT_SECRET: string;

  @IsString() @IsOptional()
  JWT_EXPIRES_IN = '12h';

  @IsString() @IsOptional()
  STORAGE_DIR = './storage';

  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  MAX_RECEIPT_MB = 5;

  @Type(() => Number) @IsInt() @Min(0) @IsOptional()
  CHECKOUT_GRACE_HOURS = 24;

  @Type(() => Number) @IsInt() @Min(0) @IsOptional()
  SHIPPING_FLAT_COP = 15000;

  @Type(() => Number) @IsInt() @Min(0) @IsOptional()
  FREE_SHIPPING_FROM_COP = 0;

  @IsString() @IsOptional() PAYMENT_NEQUI_NUMBER = '';
  @IsString() @IsOptional() PAYMENT_DAVIPLATA_NUMBER = '';
  @IsString() @IsOptional() PAYMENT_BANK_INFO = '';
  @IsString() @IsOptional() PAYMENT_ACCOUNT_HOLDER = '';

  @IsString() @IsOptional() SENDER_NAME = 'Tienda';
  @IsString() @IsOptional() SENDER_PHONE = '';
  @IsString() @IsOptional() SENDER_CITY_CODE = '11001';
  @IsString() @IsOptional() SENDER_ADDRESS = '';
  @IsString() @IsOptional() SENDER_DOCUMENT = '';

  @IsIn(['MOCK', 'MIPAQUETE', 'SKYDROPX']) @IsOptional()
  SHIPPING_PROVIDER: 'MOCK' | 'MIPAQUETE' | 'SKYDROPX' = 'MOCK';

  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  SHIPPING_BATCH_CONCURRENCY = 3;

  @IsString() @IsOptional() MIPAQUETE_BASE_URL = '';
  @IsString() @IsOptional() MIPAQUETE_API_KEY = '';
  @IsString() @IsOptional() SKYDROPX_BASE_URL = '';
  @IsString() @IsOptional() SKYDROPX_CLIENT_ID = '';
  @IsString() @IsOptional() SKYDROPX_CLIENT_SECRET = '';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`Variables de entorno inválidas:\n  ${detail.join('\n  ')}`);
  }
  return validated;
}
