import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';

const ADMIN_ROOM = 'admins';

export interface StockUpdate {
  variantId: string;
  available: number;
}

/**
 * Canal en tiempo real.
 *  - Cualquier cliente (checkout) recibe `stock.updated`.
 *  - Clientes con JWT admin en `handshake.auth.token` entran a la sala de admins
 *    y reciben eventos de pedidos/pagos/guías.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;
    try {
      const admin = await this.jwt.verifyAsync<AdminJwtPayload>(token);
      client.data.admin = admin;
      await client.join(ADMIN_ROOM);
    } catch {
      this.logger.warn(`Socket ${client.id} envió un token admin inválido`);
      client.disconnect(true);
    }
  }

  emitStock(updates: StockUpdate[]) {
    if (updates.length === 0 || !this.server) return;
    this.server.emit('stock.updated', updates);
  }

  emitToAdmins(event: 'order.created' | 'order.updated' | 'payment.submitted' | 'batch.updated', payload: unknown) {
    this.server?.to(ADMIN_ROOM).emit(event, payload);
  }
}
