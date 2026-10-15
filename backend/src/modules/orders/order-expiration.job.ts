import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStateService, StaleOrderStateException } from './order-state.service';

/**
 * Libera el stock de pedidos que no subieron comprobante a tiempo.
 * Es seguro correrlo en varias instancias a la vez: la transición optimista
 * garantiza que cada pedido se expire (y se libere) una sola vez.
 */
@Injectable()
export class OrderExpirationJob {
  private readonly logger = new Logger(OrderExpirationJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orderState: OrderStateService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.expireDue();
    } finally {
      this.running = false;
    }
  }

  async expireDue(batchSize = 200): Promise<number> {
    const now = new Date();
    const due = await this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', reservedUntil: { lt: now } },
      select: { id: true },
      orderBy: { reservedUntil: 'asc' },
      take: batchSize,
    });

    const touchedVariants = new Set<string>();
    let expired = 0;

    for (const { id } of due) {
      try {
        const items = await this.prisma.$transaction(async (tx) => {
          await this.orderState.transition(tx, id, ['PENDING_PAYMENT'], 'EXPIRED', {
            note: 'Reserva vencida sin comprobante de pago',
            where: { reservedUntil: { lt: now } },
          });
          const lines = await tx.orderItem.findMany({ where: { orderId: id }, select: { variantId: true, quantity: true } });
          await this.inventory.release(tx, id, lines, 'Reserva vencida');
          return lines;
        });
        items.forEach((i) => touchedVariants.add(i.variantId));
        this.realtime.emitToAdmins('order.updated', { id, status: 'EXPIRED' });
        expired++;
      } catch (error) {
        // Otro proceso lo movió primero (subió comprobante, admin lo canceló...): no hay nada que hacer.
        if (!(error instanceof StaleOrderStateException)) this.logger.error(`Error expirando pedido ${id}`, error as Error);
      }
    }

    if (expired > 0) {
      this.logger.log(`${expired} pedido(s) expirados; stock liberado`);
      await this.inventory.broadcast([...touchedVariants]);
    }
    return expired;
  }
}
