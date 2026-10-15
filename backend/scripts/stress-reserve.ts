/* eslint-disable no-console */
/**
 * Prueba de concurrencia: N compradores intentan llevarse el último labial al mismo tiempo.
 *
 *   npm run stress:reserve -- [compradores=50] [sku=LAB-MAT-09] [url=http://localhost:3000/api]
 *
 * Requisitos: API corriendo, seed aplicado y el Live "live-demo" en estado LIVE.
 * El script deja el stock disponible de la variante en 1, dispara todas las peticiones en
 * paralelo y verifica que exactamente UNA gane y el resto reciba 409 OUT_OF_STOCK.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const [buyers = '50', sku = 'LAB-MAT-09', baseUrl = 'http://localhost:3000/api'] = process.argv.slice(2);
if (!process.env.DATABASE_URL) process.loadEnvFile('.env');
const prisma = new PrismaClient();

async function main() {
  const variant = await prisma.productVariant.findUniqueOrThrow({ where: { sku }, include: { inventory: true } });
  // Dejar exactamente 1 unidad disponible.
  await prisma.inventoryItem.update({
    where: { variantId: variant.id },
    data: { onHand: (variant.inventory?.reserved ?? 0) + 1 },
  });
  console.log(`Variante ${sku}: disponible = 1. Lanzando ${buyers} compras simultáneas...`);

  const attempt = (i: number) =>
    fetch(`${baseUrl}/public/lives/live-demo/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': `10.0.${Math.floor(i / 250)}.${i % 250}` },
      body: JSON.stringify({
        items: [{ variantId: variant.id, quantity: 1 }],
        customer: { fullName: `Compradora ${i}`, documentType: 'CC', documentNumber: String(1_000_000_000 + i), phone: '3001234567' },
        shipping: { cityCode: '11001', addressLine: `Calle ${i} # 10-20` },
        acceptsDataPolicy: true,
      }),
    }).then(async (res) => ({ status: res.status, body: (await res.json()) as { code?: string } }));

  const results = await Promise.all(Array.from({ length: Number(buyers) }, (_, i) => attempt(i)));
  const won = results.filter((r) => r.status === 201).length;
  const outOfStock = results.filter((r) => r.status === 409 && r.body.code === 'OUT_OF_STOCK').length;
  const other = results.filter((r) => r.status !== 201 && !(r.status === 409 && r.body.code === 'OUT_OF_STOCK'));

  const inv = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });
  console.log({ ganaron: won, agotado: outOfStock, otros: other.length, onHand: inv.onHand, reserved: inv.reserved });
  if (other.length) console.log('Respuestas inesperadas (¿rate limit?):', other.slice(0, 3));

  if (won === 1 && inv.reserved <= inv.onHand) console.log('✔ Sin sobreventa: exactamente un comprador obtuvo la unidad.');
  else {
    console.error('✘ Resultado inesperado');
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
