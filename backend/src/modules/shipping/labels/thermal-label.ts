import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { ShipmentRequest } from '../providers/shipping-provider.interface';

/** 4 x 6 pulgadas (≈100 x 150 mm), el tamaño estándar de las impresoras térmicas de guías. */
export const LABEL_WIDTH = 288;
export const LABEL_HEIGHT = 432;

const MARGIN = 14;
const BLACK = rgb(0, 0, 0);

/** Las fuentes estándar de PDF usan WinAnsi: se reemplaza lo que no se pueda dibujar (emojis, etc.). */
const safe = (text: string | null | undefined) => (text ?? '').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '');

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of safe(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Código de barras decorativo (no escaneable): la guía real viene del agregador logístico. */
function fakeBarcode(page: PDFPage, value: string, x: number, y: number, width: number, height: number) {
  const pattern = [...value].flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2), 1 + ((n >> 3) % 3), 1 + ((n >> 1) % 2)];
  });
  const total = pattern.reduce((a, b) => a + b, 0);
  const unit = width / total;
  let cursor = x;
  pattern.forEach((w, i) => {
    if (i % 2 === 0) page.drawRectangle({ x: cursor, y, width: w * unit, height, color: BLACK });
    cursor += w * unit;
  });
}

export interface LabelData {
  carrier: string;
  trackingNumber: string;
  request: ShipmentRequest;
  watermark?: string;
}

export async function renderThermalLabel({ carrier, trackingNumber, request, watermark }: LabelData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Guía ${trackingNumber}`);
  const page = pdf.addPage([LABEL_WIDTH, LABEL_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const innerWidth = LABEL_WIDTH - MARGIN * 2;

  let y = LABEL_HEIGHT - MARGIN;
  const text = (value: string, size: number, font = regular, x = MARGIN) => {
    y -= size + 2;
    page.drawText(safe(value), { x, y, size, font, color: BLACK });
  };
  const paragraph = (value: string, size: number, font = regular) => wrap(value, font, size, innerWidth).forEach((l) => text(l, size, font));
  const divider = () => {
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: LABEL_WIDTH - MARGIN, y }, thickness: 1, color: BLACK });
    y -= 2;
  };

  // Encabezado
  text(carrier.toUpperCase(), 16, bold);
  if (watermark) text(watermark, 8, bold);
  divider();

  // Código de barras + número de guía
  y -= 52;
  fakeBarcode(page, trackingNumber, MARGIN, y, innerWidth, 48);
  text(trackingNumber, 14, bold, MARGIN + (innerWidth - bold.widthOfTextAtSize(trackingNumber, 14)) / 2);
  divider();

  // Destinatario (lo más grande: es lo que lee el mensajero)
  const r = request.recipient;
  text('DESTINATARIO', 8, bold);
  paragraph(r.fullName, 13, bold);
  text(`Tel: ${r.phone}`, 10);
  paragraph(r.addressLine, 11);
  if (r.neighborhood) paragraph(`Barrio: ${r.neighborhood}`, 9);
  if (r.additionalInfo) paragraph(r.additionalInfo, 9);
  paragraph(`${r.cityName ?? ''} - ${r.departmentName ?? ''}`.toUpperCase(), 14, bold);
  divider();

  // Remitente
  const s = request.sender;
  text('REMITENTE', 8, bold);
  text(s.fullName, 9);
  paragraph(`${s.addressLine} · Tel: ${s.phone}`, 8);
  divider();

  // Contenido
  text(`Pedido: ${request.orderCode}`, 11, bold);
  text(`Unidades: ${request.units}   Peso: ${(request.weightGrams / 1000).toFixed(2)} kg`, 9);
  text(`Valor declarado: $${request.declaredValueCop.toLocaleString('es-CO')}`, 9);
  text(request.collectOnDeliveryCop > 0 ? `RECAUDO: $${request.collectOnDeliveryCop.toLocaleString('es-CO')}` : 'PAGADO - NO COBRAR', 10, bold);
  paragraph(`Contenido: ${request.contentDescription}`, 7);

  return Buffer.from(await pdf.save());
}

/** Une varias guías en un solo PDF para imprimir el lote completo de una vez. */
export async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  merged.setTitle(`Lote de ${buffers.length} guías`);
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}
