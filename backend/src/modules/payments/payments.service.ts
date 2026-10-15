import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { orderCode } from '../../common/utils/order-code';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStateService } from '../orders/order-state.service';
import { PaymentQueryDto } from './dto/payment.dto';

/** Minutos que tiene el cliente para re-subir un comprobante rechazado. */
const RETRY_WINDOW_MINUTES = 60;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orderState: OrderStateService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(query: PaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = { status: query.status ?? PaymentStatus.PENDING_REVIEW };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        // Cola de revisión: los más antiguos primero (FIFO).
        orderBy: { createdAt: where.status === 'PENDING_REVIEW' ? 'asc' : 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          order: {
            select: {
              id: true,
              number: true,
              totalCop: true,
              status: true,
              shipFullName: true,
              shipPhone: true,
              items: { select: { productName: true, variantName: true, quantity: true } },
            },
          },
          reviewedBy: { select: { fullName: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    const data = rows.map((p) => ({ ...p, order: { ...p.order, code: orderCode(p.order.number) } }));
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async receipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return { stream: this.storage.stream(payment.receiptPath), mimeType: payment.receiptMimeType };
  }

  /** Aprobar: pedido → PAID y la reserva se convierte en venta, todo en una transacción. */
  async approve(paymentId: string, adminUserId: string) {
    const orderId = await this.prisma.$transaction(async (tx) => {
      const payment = await this.claimPendingPayment(tx, paymentId, 'APPROVED', adminUserId);
      await this.orderState.transition(tx, payment.orderId, ['PAYMENT_REVIEW'], 'PAID', {
        adminUserId,
        note: `Pago ${payment.method} aprobado`,
        data: { paidAt: new Date() },
      });
      const lines = await tx.orderItem.findMany({ where: { orderId: payment.orderId }, select: { variantId: true, quantity: true } });
      await this.inventory.commitSale(tx, payment.orderId, lines, adminUserId);
      return payment.orderId;
    });

    this.realtime.emitToAdmins('order.updated', { id: orderId, status: 'PAID' });
    return { orderId, status: 'PAID' as const };
  }

  /**
   * Rechazar: el stock sigue apartado y el pedido vuelve a PENDING_PAYMENT con una nueva
   * ventana para que el cliente suba un comprobante válido. Si no lo hace, el job lo expira.
   */
  async reject(paymentId: string, adminUserId: string, reason: string) {
    const orderId = await this.prisma.$transaction(async (tx) => {
      const payment = await this.claimPendingPayment(tx, paymentId, 'REJECTED', adminUserId, reason);
      await this.orderState.transition(tx, payment.orderId, ['PAYMENT_REVIEW'], 'PENDING_PAYMENT', {
        adminUserId,
        note: `Comprobante rechazado: ${reason}`,
        data: { reservedUntil: new Date(Date.now() + RETRY_WINDOW_MINUTES * 60_000) },
      });
      return payment.orderId;
    });

    this.realtime.emitToAdmins('order.updated', { id: orderId, status: 'PENDING_PAYMENT' });
    return { orderId, status: 'PENDING_PAYMENT' as const };
  }

  /** Marca el pago como revisado solo si sigue pendiente: dos admins no pueden aprobarlo a la vez. */
  private async claimPendingPayment(
    tx: Prisma.TransactionClient,
    paymentId: string,
    status: 'APPROVED' | 'REJECTED',
    adminUserId: string,
    rejectionReason?: string,
  ) {
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PENDING_REVIEW' },
      data: { status, reviewedById: adminUserId, reviewedAt: new Date(), rejectionReason },
    });
    if (count === 0) {
      const exists = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
      if (!exists) throw new NotFoundException('Pago no encontrado');
      throw new ConflictException(`Este pago ya fue revisado (${exists.status})`);
    }
    return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }
}
