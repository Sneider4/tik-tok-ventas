/** Número de pedido legible para el cliente y la guía: 123 -> "PED-000123". */
export const orderCode = (number: number): string => `PED-${String(number).padStart(6, '0')}`;
