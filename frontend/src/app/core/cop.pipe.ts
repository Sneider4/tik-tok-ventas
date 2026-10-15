import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** 32000 → "$ 32.000" */
export const formatCop = (value: number): string => formatter.format(value);

@Pipe({ name: 'cop' })
export class CopPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '' : formatCop(value);
  }
}
