import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { orderCode } from '../../common/utils/order-code';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import { InventoryService } from '../inventory/inventory.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrderStateService } from './order-state.service';

export const orderDetailInclude = {
  customer: true,
  items: true,
  payments: { orderBy: { createdAt: 'desc' } },
  shipment: true,
  liveSession: { select: { id: true, title: true, slug: true } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { adminUser: { select: { fullName: true } } },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orderState: OrderStateService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status?.length && { status: { in: query.status } }),
      ...(query.liveSessionId && { liveSessionId: query.liveSessionId }),
      ...((query.from || query.to) && {
        createdAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) },
      }),
      ...(query.search && { OR: this.searchFilter(query.search) }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          customer: { select: { fullName: true, phone: true } },
          items: { select: { quantity: true } },
          shipment: { select: { status: true, trackingNumber: true, carrier: true } },
          payments: { select: { id: true, status: true, method: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const data = rows.map(({ items, payments, ...order }) => ({
      ...order,
      code: orderCode(order.number),
      units: items.reduce((sum, i) => sum + i.quantity, 0),
      lastPayment: payments[0] ?? null,
    }));
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return { ...order, code: orderCode(order.number) };
  }

  /**
   * Cancela un pedido y devuelve el stock al lugar correcto:
   *  - Sin pagar  → libera la reserva.
   *  - Pagado     → devuelve las unidades al físico (el reembolso se gestiona por fuera).
   *  - Con guía   → hay que anular la guía primero.
   */
  async cancel(id: string, adminUserId: string, reason?: string) {
    const variantIds = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException('Pedido no encontrado');

      const lines = order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      const note = reason ?? 'Cancelado por administrador';
      const unpaid: OrderStatus[] = ['PENDING_PAYMENT', 'PAYMENT_REVIEW'];

      if (unpaid.includes(order.status)) {
        await this.orderState.transition(tx, id, unpaid, 'CANCELLED', { adminUserId, note, data: { cancelledAt: new Date() } });
        await this.inventory.release(tx, id, lines, note);
        await tx.payment.updateMany({
          where: { orderId: id, status: 'PENDING_REVIEW' },
          data: { status: 'REJECTED', rejectionReason: 'Pedido cancelado', reviewedById: adminUserId, reviewedAt: new Date() },
        });
      } else if (order.status === 'PAID') {
        await this.orderState.transition(tx, id, ['PAID'], 'CANCELLED', { adminUserId, note, data: { cancelledAt: new Date() } });
        await this.inventory.returnToStock(tx, id, lines, adminUserId, note);
      } else {
        throw new ConflictException(`No se puede cancelar un pedido en estado ${order.status}`);
      }
      return lines.map((l) => l.variantId);
    });

    await this.inventory.broadcast(variantIds);
    this.realtime.emitToAdmins('order.updated', { id, status: 'CANCELLED' });
    return this.get(id);
  }

  /** Despacho: la transportadora recogió los paquetes. */
  async markShipped(orderIds: string[], adminUserId: string) {
    return this.bulkTransition(orderIds, ['LABEL_GENERATED'], 'SHIPPED', adminUserId, (tx, id) =>
      tx.shipment.updateMany({ where: { orderId: id }, data: { status: 'IN_TRANSIT' } }),
    );
  }

  async markDelivered(orderIds: string[], adminUserId: string) {
    return this.bulkTransition(orderIds, ['SHIPPED'], 'DELIVERED', adminUserId, (tx, id) =>
      tx.shipment.updateMany({ where: { orderId: id }, data: { status: 'DELIVERED' } }),
    );
  }

  private async bulkTransition(
    orderIds: string[],
    from: OrderStatus[],
    to: OrderStatus,
    adminUserId: string,
    extra: (tx: Prisma.TransactionClient, id: string) => Promise<unknown>,
  ) {
    const results: { orderId: string; ok: boolean; error?: string }[] = [];
    for (const id of orderIds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.orderState.transition(tx, id, from, to, { adminUserId });
          await extra(tx, id);
        });
        this.realtime.emitToAdmins('order.updated', { id, status: to });
        results.push({ orderId: id, ok: true });
      } catch (error) {
        results.push({ orderId: id, ok: false, error: (error as Error).message });
      }
    }
    return results;
  }

  private searchFilter(search: string): Prisma.OrderWhereInput[] {
    const term = search.trim();
    const number = Number(term.replace(/^PED-?/i, ''));
    return [
      ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
      { shipFullName: { contains: term, mode: 'insensitive' } },
      { shipPhone: { contains: term } },
      { customer: { documentNumber: { contains: term } } },
      { customer: { tiktokUsername: { contains: term.replace(/^@/, ''), mode: 'insensitive' } } },
      { shipment: { trackingNumber: { contains: term } } },
    ];
  }
}
