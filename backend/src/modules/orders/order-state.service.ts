import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { Tx } from '../../infrastructure/prisma/prisma.service';

export class StaleOrderStateException extends ConflictException {
  constructor(orderId: string, expected: OrderStatus[], actual: OrderStatus) {
    super({
      statusCode: 409,
      code: 'ORDER_STATE_CHANGED',
      message: `El pedido está en estado ${actual}; se esperaba ${expected.join(' o ')}`,
      orderId,
    });
  }
}

interface TransitionOptions {
  adminUserId?: string;
  note?: string;
  /** Campos extra a actualizar junto con el estado (paidAt, reservedUntil...). */
  data?: Prisma.OrderUpdateManyMutationInput;
  /** Condiciones extra que deben seguir siendo ciertas al momento del UPDATE. */
  where?: Prisma.OrderWhereInput;
}

/**
 * Transiciones de estado con bloqueo optimista:
 *   UPDATE orders SET status = :to WHERE id = :id AND status = :leído
 * Si otro proceso (job de expiración, otro admin) cambió el pedido en medio,
 * el UPDATE afecta 0 filas y abortamos la transacción. Así el stock nunca se
 * libera ni se vende dos veces.
 */
@Injectable()
export class OrderStateService {
  async transition(tx: Tx, orderId: string, allowedFrom: OrderStatus[], to: OrderStatus, opts: TransitionOptions = {}) {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!current) throw new NotFoundException('Pedido no encontrado');
    if (!allowedFrom.includes(current.status)) throw new StaleOrderStateException(orderId, allowedFrom, current.status);

    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: current.status, ...opts.where },
      data: { status: to, ...opts.data },
    });
    if (count === 0) throw new StaleOrderStateException(orderId, allowedFrom, current.status);

    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: current.status, toStatus: to, adminUserId: opts.adminUserId, note: opts.note },
    });
    return current.status;
  }
}
