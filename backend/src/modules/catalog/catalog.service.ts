import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../../infrastructure/prisma/prisma.service';
import { CreateProductDto, CreateVariantDto, ProductQueryDto, UpdateProductDto, UpdateVariantDto } from './dto/catalog.dto';

const productInclude = {
  variants: {
    orderBy: { sku: 'asc' },
    include: { inventory: true },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQueryDto) {
    const where: Prisma.ProductWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { brand: { contains: query.search, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, orderBy: { name: 'asc' }, skip: query.skip, take: query.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async create(dto: CreateProductDto, adminUserId: string) {
    const { variants = [], ...data } = dto;
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data });
      for (const variant of variants) await this.createVariantTx(tx, created.id, variant, adminUserId);
      return created;
    });
    return this.get(product.id);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.prisma.product.update({ where: { id }, data: dto });
    return this.get(id);
  }

  async addVariant(productId: string, dto: CreateVariantDto, adminUserId: string) {
    await this.prisma.$transaction((tx) => this.createVariantTx(tx, productId, dto, adminUserId));
    return this.get(productId);
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    return this.prisma.productVariant.update({ where: { id: variantId }, data: dto, include: { inventory: true } });
  }

  /** Toda variante nace con su fila de inventario (la reserva atómica depende de que exista). */
  private async createVariantTx(tx: Tx, productId: string, dto: CreateVariantDto, adminUserId: string) {
    const { initialStock = 0, lowStockThreshold, ...variantData } = dto;
    const variant = await tx.productVariant.create({
      data: {
        ...variantData,
        productId,
        inventory: { create: { onHand: initialStock, ...(lowStockThreshold !== undefined && { lowStockThreshold }) } },
      },
    });
    if (initialStock > 0) {
      await tx.inventoryMovement.create({
        data: { variantId: variant.id, type: 'RESTOCK', deltaOnHand: initialStock, adminUserId, reason: 'Stock inicial' },
      });
    }
    return variant;
  }
}
