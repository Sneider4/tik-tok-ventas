import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../../infrastructure/prisma/prisma.service';
import { RealtimeGateway, StockUpdate } from '../../infrastructure/realtime/realtime.gateway';
import { InventoryQueryDto } from './dto/inventory-query.dto';

export interface StockLine {
  variantId: string;
  quantity: number;
}

export interface OutOfStockItem {
  variantId: string;
  requested: number;
  available: number;
}

export class OutOfStockException extends ConflictException {
  constructor(public readonly items: OutOfStockItem[]) {
    super({ statusCode: 409, code: 'OUT_OF_STOCK', message: 'Uno o más productos se agotaron', items });
  }
}

/**
 * Única puerta de entrada para modificar inventario.
 *
 * Todas las operaciones de reserva/venta usan UPDATE condicionales atómicos:
 * la verificación ("¿hay suficiente?") y la escritura ocurren en la misma sentencia,
 * bajo el lock de fila de PostgreSQL. Ver docs/ARQUITECTURA.md §4.
 *
 * Los métodos que reciben `tx` deben llamarse dentro de una transacción del llamador,
 * para que la reserva y la creación del pedido sean atómicas entre sí.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Aparta stock para un pedido. Si cualquier línea no alcanza, lanza OutOfStockException
   * (el llamador hace rollback y nada queda reservado).
   */
  async reserve(tx: Tx, orderId: string, lines: StockLine[]): Promise<void> {
    const normalized = this.normalize(lines);
    const failures: OutOfStockItem[] = [];

    for (const { variantId, quantity } of normalized) {
      const affected = await tx.$executeRaw`
        UPDATE inventory_items
        SET    "reserved" = "reserved" + ${quantity}, "updatedAt" = now()
        WHERE  "variantId" = ${variantId}::uuid
          AND  "onHand" - "reserved" >= ${quantity}`;

      if (affected === 0) {
        failures.push({ variantId, requested: quantity, available: await this.availableIn(tx, variantId) });
      }
    }

    if (failures.length > 0) throw new OutOfStockException(failures);
    await this.log(tx, orderId, normalized, InventoryMovementType.RESERVE, 0, +1);
  }

  /** Devuelve al disponible lo reservado (pedido expirado, rechazado o cancelado antes de pagar). */
  async release(tx: Tx, orderId: string, lines: StockLine[], reason?: string): Promise<void> {
    const normalized = this.normalize(lines);
    for (const { variantId, quantity } of normalized) {
      const affected = await tx.$executeRaw`
        UPDATE inventory_items
        SET    "reserved" = "reserved" - ${quantity}, "updatedAt" = now()
        WHERE  "variantId" = ${variantId}::uuid AND "reserved" >= ${quantity}`;
      this.assertInvariant(affected, variantId, 'liberar reserva');
    }
    await this.log(tx, orderId, normalized, InventoryMovementType.RELEASE, 0, -1, reason);
  }

  /** Pago aprobado: la reserva se convierte en venta (sale del inventario físico). */
  async commitSale(tx: Tx, orderId: string, lines: StockLine[], adminUserId?: string): Promise<void> {
    const normalized = this.normalize(lines);
    for (const { variantId, quantity } of normalized) {
      const affected = await tx.$executeRaw`
        UPDATE inventory_items
        SET    "onHand" = "onHand" - ${quantity}, "reserved" = "reserved" - ${quantity}, "updatedAt" = now()
        WHERE  "variantId" = ${variantId}::uuid AND "reserved" >= ${quantity} AND "onHand" >= ${quantity}`;
      this.assertInvariant(affected, variantId, 'confirmar venta');
    }
    await this.log(tx, orderId, normalized, InventoryMovementType.SALE, -1, -1, undefined, adminUserId);
  }

  /** Cancelación de un pedido ya pagado (sin guía): las unidades vuelven al estante. */
  async returnToStock(tx: Tx, orderId: string, lines: StockLine[], adminUserId?: string, reason?: string): Promise<void> {
    const normalized = this.normalize(lines);
    for (const { variantId, quantity } of normalized) {
      await tx.$executeRaw`
        UPDATE inventory_items
        SET    "onHand" = "onHand" + ${quantity}, "updatedAt" = now()
        WHERE  "variantId" = ${variantId}::uuid`;
    }
    await this.log(tx, orderId, normalized, InventoryMovementType.RETURN, +1, 0, reason, adminUserId);
  }

  /**
   * Entrada de mercancía o ajuste manual. Un ajuste negativo nunca puede dejar
   * el físico por debajo de lo ya reservado por clientes.
   */
  async adjust(variantId: string, delta: number, type: 'RESTOCK' | 'ADJUSTMENT', adminUserId: string, reason?: string) {
    if (delta === 0) throw new BadRequestException('El ajuste no puede ser 0');
    if (type === 'RESTOCK' && delta < 0) throw new BadRequestException('Una entrada de mercancía debe ser positiva');

    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE inventory_items
        SET    "onHand" = "onHand" + ${delta}, "updatedAt" = now()
        WHERE  "variantId" = ${variantId}::uuid AND "onHand" + ${delta} >= "reserved"`;

      if (affected === 0) {
        const exists = await tx.inventoryItem.findUnique({ where: { variantId } });
        if (!exists) throw new NotFoundException('Variante sin inventario');
        throw new ConflictException(
          `No se puede reducir por debajo de lo reservado (físico ${exists.onHand}, reservado ${exists.reserved})`,
        );
      }
      await tx.inventoryMovement.create({
        data: { variantId, type, deltaOnHand: delta, adminUserId, reason },
      });
    });

    await this.broadcast([variantId]);
    return this.getItem(variantId);
  }

  async getItem(variantId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { variantId },
      include: { variant: { include: { product: { select: { id: true, name: true } } } } },
    });
    if (!item) throw new NotFoundException('Variante sin inventario');
    return { ...item, available: item.onHand - item.reserved };
  }

  async list(query: InventoryQueryDto) {
    const where: Prisma.InventoryItemWhereInput = {
      variant: {
        ...(query.search && {
          OR: [
            { sku: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
            { product: { name: { contains: query.search, mode: 'insensitive' } } },
          ],
        }),
      },
    };

    // "Stock bajo" compara dos columnas entre sí: se resuelve con SQL y luego se filtra por id.
    if (query.lowStock) {
      const rows = await this.prisma.$queryRaw<{ variantId: string }[]>`
        SELECT "variantId" FROM inventory_items WHERE "onHand" - "reserved" <= "lowStockThreshold"`;
      where.variantId = { in: rows.map((r) => r.variantId) };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: { variant: { include: { product: { select: { id: true, name: true, brand: true } } } } },
        orderBy: { variant: { sku: 'asc' } },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return { data: items.map((i) => this.withAvailable(i)), page: query.page, pageSize: query.pageSize, total };
  }

  async movements(variantId: string, take = 100) {
    return this.prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { adminUser: { select: { fullName: true } } },
    });
  }

  async availability(variantIds: string[]): Promise<StockUpdate[]> {
    if (variantIds.length === 0) return [];
    const items = await this.prisma.inventoryItem.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, onHand: true, reserved: true },
    });
    return items.map((i) => ({ variantId: i.variantId, available: i.onHand - i.reserved }));
  }

  /** Emitir SIEMPRE después del commit, nunca dentro de la transacción. */
  async broadcast(variantIds: string[]): Promise<void> {
    this.realtime.emitStock(await this.availability([...new Set(variantIds)]));
  }

  private withAvailable<T extends { onHand: number; reserved: number }>(item: T) {
    return { ...item, available: item.onHand - item.reserved };
  }

  /** Agrupa duplicados y ordena por id: orden de locks consistente => sin deadlocks. */
  private normalize(lines: StockLine[]): StockLine[] {
    const merged = new Map<string, number>();
    for (const { variantId, quantity } of lines) {
      if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException('Cantidad inválida');
      merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);
    }
    return [...merged.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([variantId, quantity]) => ({ variantId, quantity }));
  }

  private async availableIn(tx: Tx, variantId: string): Promise<number> {
    const item = await tx.inventoryItem.findUnique({ where: { variantId }, select: { onHand: true, reserved: true } });
    return item ? Math.max(item.onHand - item.reserved, 0) : 0;
  }

  private assertInvariant(affected: number, variantId: string, operation: string) {
    // Si esto ocurre hay un bug en la máquina de estados (p. ej. doble liberación): abortar todo.
    if (affected === 0) throw new ConflictException(`Inventario inconsistente al ${operation} (variante ${variantId})`);
  }

  private async log(
    tx: Tx,
    orderId: string,
    lines: StockLine[],
    type: InventoryMovementType,
    onHandSign: -1 | 0 | 1,
    reservedSign: -1 | 0 | 1,
    reason?: string,
    adminUserId?: string,
  ) {
    await tx.inventoryMovement.createMany({
      data: lines.map(({ variantId, quantity }) => ({
        variantId,
        orderId,
        type,
        deltaOnHand: onHandSign * quantity,
        deltaReserved: reservedSign * quantity,
        reason,
        adminUserId,
      })),
    });
  }
}
