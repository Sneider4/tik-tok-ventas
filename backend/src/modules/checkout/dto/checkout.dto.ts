import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DocumentType, PaymentMethod } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export class CheckoutItemDto {
  @IsUUID()
  variantId: string;

  @IsInt() @Min(1) @Max(50)
  quantity: number;
}

export class CheckoutCustomerDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120)
  fullName: string;

  @IsEnum(DocumentType)
  documentType: DocumentType;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[.\s-]/g, '') : value))
  @IsString() @Matches(/^[A-Za-z0-9]{4,20}$/, { message: 'Número de documento inválido' })
  documentNumber: string;

  /** Celular colombiano. Acepta "300 123 4567", "+57 3001234567"... y lo normaliza a 10 dígitos. */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '') : value))
  @Matches(/^3\d{9}$/, { message: 'Celular inválido: debe tener 10 dígitos y empezar por 3' })
  phone: string;

  @Transform(trim) @IsEmail() @IsOptional()
  email?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@/, '') : value))
  @IsString() @MaxLength(60) @IsOptional()
  tiktokUsername?: string;
}

export class CheckoutShippingDto {
  @IsString() @Matches(/^\d{5}$/, { message: 'Código de ciudad DANE inválido' })
  cityCode: string;

  @Transform(trim) @IsString() @MinLength(5) @MaxLength(200)
  addressLine: string;

  @Transform(trim) @IsString() @MaxLength(100) @IsOptional()
  neighborhood?: string;

  /** Torre, apto, conjunto, referencias para el mensajero. */
  @Transform(trim) @IsString() @MaxLength(200) @IsOptional()
  additionalInfo?: string;
}

export class CheckoutDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @ValidateNested() @Type(() => CheckoutCustomerDto)
  customer: CheckoutCustomerDto;

  @ValidateNested() @Type(() => CheckoutShippingDto)
  shipping: CheckoutShippingDto;

  @Transform(trim) @IsString() @MaxLength(500) @IsOptional()
  notes?: string;

  /** Autorización de tratamiento de datos personales (Ley 1581 de 2012). */
  @IsBoolean() @Equals(true, { message: 'Debes autorizar el tratamiento de datos personales' })
  acceptsDataPolicy: boolean;
}

/** Campos de texto del multipart al subir el comprobante. */
export class SubmitPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @Transform(trim) @IsString() @MaxLength(60) @IsOptional()
  reference?: string;
}
