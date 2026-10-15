/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Departamentos (códigos DANE). Las 33 entidades territoriales.
const departments: [string, string][] = [
  ['05', 'Antioquia'], ['08', 'Atlántico'], ['11', 'Bogotá D.C.'], ['13', 'Bolívar'], ['15', 'Boyacá'],
  ['17', 'Caldas'], ['18', 'Caquetá'], ['19', 'Cauca'], ['20', 'Cesar'], ['23', 'Córdoba'],
  ['25', 'Cundinamarca'], ['27', 'Chocó'], ['41', 'Huila'], ['44', 'La Guajira'], ['47', 'Magdalena'],
  ['50', 'Meta'], ['52', 'Nariño'], ['54', 'Norte de Santander'], ['63', 'Quindío'], ['66', 'Risaralda'],
  ['68', 'Santander'], ['70', 'Sucre'], ['73', 'Tolima'], ['76', 'Valle del Cauca'], ['81', 'Arauca'],
  ['85', 'Casanare'], ['86', 'Putumayo'], ['88', 'San Andrés y Providencia'], ['91', 'Amazonas'],
  ['94', 'Guainía'], ['95', 'Guaviare'], ['97', 'Vaupés'], ['99', 'Vichada'],
];

// Capitales + principales áreas metropolitanas. Para producción, importar el listado DANE
// completo (~1.100 municipios) con el mismo formato [código, nombre].
const cities: [string, string][] = [
  ['05001', 'Medellín'], ['05088', 'Bello'], ['05266', 'Envigado'], ['05360', 'Itagüí'], ['05631', 'Sabaneta'], ['05615', 'Rionegro'],
  ['08001', 'Barranquilla'], ['08758', 'Soledad'], ['08573', 'Puerto Colombia'],
  ['11001', 'Bogotá D.C.'],
  ['13001', 'Cartagena de Indias'],
  ['15001', 'Tunja'], ['15238', 'Duitama'], ['15759', 'Sogamoso'],
  ['17001', 'Manizales'],
  ['18001', 'Florencia'],
  ['19001', 'Popayán'],
  ['20001', 'Valledupar'],
  ['23001', 'Montería'],
  ['25754', 'Soacha'], ['25175', 'Chía'], ['25899', 'Zipaquirá'], ['25269', 'Facatativá'], ['25473', 'Mosquera'], ['25430', 'Madrid'], ['25290', 'Fusagasugá'], ['25307', 'Girardot'], ['25214', 'Cota'], ['25126', 'Cajicá'],
  ['27001', 'Quibdó'],
  ['41001', 'Neiva'],
  ['44001', 'Riohacha'],
  ['47001', 'Santa Marta'],
  ['50001', 'Villavicencio'],
  ['52001', 'Pasto'],
  ['54001', 'Cúcuta'], ['54874', 'Villa del Rosario'],
  ['63001', 'Armenia'],
  ['66001', 'Pereira'], ['66170', 'Dosquebradas'],
  ['68001', 'Bucaramanga'], ['68276', 'Floridablanca'], ['68307', 'Girón'], ['68547', 'Piedecuesta'],
  ['70001', 'Sincelejo'],
  ['73001', 'Ibagué'],
  ['76001', 'Cali'], ['76520', 'Palmira'], ['76364', 'Jamundí'], ['76892', 'Yumbo'], ['76834', 'Tuluá'], ['76109', 'Buenaventura'],
  ['81001', 'Arauca'],
  ['85001', 'Yopal'],
  ['86001', 'Mocoa'],
  ['88001', 'San Andrés'],
  ['91001', 'Leticia'],
  ['94001', 'Inírida'],
  ['95001', 'San José del Guaviare'],
  ['97001', 'Mitú'],
  ['99001', 'Puerto Carreño'],
];

const products = [
  {
    name: 'Labial Matte Larga Duración',
    brand: 'Glow CO',
    description: 'Labial líquido matte de 12 horas, no transfiere.',
    variants: [
      { sku: 'LAB-MAT-01', name: 'Tono 01 Nude Natural', priceCop: 32000, stock: 25 },
      { sku: 'LAB-MAT-05', name: 'Tono 05 Rojo Pasión', priceCop: 32000, stock: 10 },
      { sku: 'LAB-MAT-09', name: 'Tono 09 Vino Intenso', priceCop: 32000, stock: 1 }, // El "último labial"
    ],
  },
  {
    name: 'Base Líquida Cobertura Media',
    brand: 'Glow CO',
    description: 'Acabado satinado con protección solar SPF 15.',
    variants: [
      { sku: 'BAS-LIQ-110', name: 'Tono 110 Claro', priceCop: 58000, stock: 12 },
      { sku: 'BAS-LIQ-220', name: 'Tono 220 Medio', priceCop: 58000, stock: 15 },
      { sku: 'BAS-LIQ-330', name: 'Tono 330 Canela', priceCop: 58000, stock: 8 },
    ],
  },
  {
    name: 'Sérum Facial Vitamina C',
    brand: 'Piel Viva',
    description: 'Sérum iluminador 30 ml.',
    variants: [{ sku: 'SER-VITC-30', name: '30 ml', priceCop: 69000, stock: 20, weightGrams: 150 }],
  },
  {
    name: 'Paleta de Sombras 12 Tonos',
    brand: 'Glow CO',
    variants: [
      { sku: 'PAL-SOM-NUDE', name: 'Edición Nude', priceCop: 75000, stock: 6, weightGrams: 200 },
      { sku: 'PAL-SOM-SUNSET', name: 'Edición Sunset', priceCop: 75000, stock: 4, weightGrams: 200 },
    ],
  },
];

async function main() {
  console.log('→ Departamentos y ciudades');
  for (const [code, name] of departments) {
    await prisma.department.upsert({ where: { code }, create: { code, name }, update: { name } });
  }
  for (const [code, name] of cities) {
    await prisma.city.upsert({
      where: { code },
      create: { code, name, departmentCode: code.slice(0, 2) },
      update: { name },
    });
  }

  console.log('→ Administrador');
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@tienda.co').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'CambiaEsta123!';
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, fullName: 'Administrador', role: 'OWNER', passwordHash: await bcrypt.hash(password, 10) },
    update: {},
  });

  console.log('→ Productos e inventario');
  const variantIds: string[] = [];
  for (const { variants, ...product } of products) {
    const existing = await prisma.product.findFirst({ where: { name: product.name } });
    const p = existing ?? (await prisma.product.create({ data: product }));
    for (const { stock, ...v } of variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        create: { ...v, productId: p.id, inventory: { create: { onHand: stock } } },
        update: {},
      });
      if (!existing) {
        await prisma.inventoryMovement.create({
          data: { variantId: variant.id, type: 'RESTOCK', deltaOnHand: stock, adminUserId: admin.id, reason: 'Seed' },
        });
      }
      variantIds.push(variant.id);
    }
  }

  console.log('→ Live de demostración');
  const live = await prisma.liveSession.upsert({
    where: { slug: 'live-demo' },
    create: { slug: 'live-demo', title: 'Live de lanzamiento 💄', status: 'LIVE', startsAt: new Date(), reservationMinutes: 30 },
    update: {},
  });
  for (const [index, variantId] of variantIds.entries()) {
    await prisma.liveSessionItem.upsert({
      where: { liveSessionId_variantId: { liveSessionId: live.id, variantId } },
      create: { liveSessionId: live.id, variantId, displayOrder: index, maxPerOrder: 5 },
      update: {},
    });
  }

  console.log(`✔ Listo. Admin: ${email}  ·  Checkout: /live/${live.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
