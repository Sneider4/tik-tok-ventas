import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachConcurrent } from '../../common/utils/concurrency';
import { orderCode } from '../../common/utils/order-code';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { OrderStateService } from '../orders/order-state.service';
import { mergePdfs } from './labels/thermal-label';
import { SHIPPING_PROVIDER, ShipmentRequest, ShippingProvider, ShippingProviderError } from './providers/shipping-provider.interface';

const orderForShipment = {
  items: { include: { variant: { select: { weightGrams: true } } } },
  customer: { select: { documentNumber: true } },
  shipment: true,
} satisfies Prisma.OrderInclude;

type OrderForShipment = Prisma.OrderGetPayload<{ include: typeof orderForShipment }>;

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly orderState: OrderStateService,
    private readonly realtime: RealtimeGateway,
    private readonly config: AppConfig,
    @Inject(SHIPPING_PROVIDER) private readonly provider: ShippingProvider,
  ) {}

  /**
   * Genera guías en lote. Responde de inmediato con el lote en PROCESSING y procesa en segundo
   * plano; el panel sigue el avance por WebSocket (`batch.updated`) o consultando el lote.
   * Solo entran pedidos PAID sin guía vigente (los FAILED se pueden reintentar).
   */
  async createBatch(orderIds: string[], adminUserId: string) {
    const unique = [...new Set(orderIds)];
    const orders = await this.prisma.order.findMany({
      where: { id: { in: unique } },
      select: { id: true, number: true, status: true, shipment: { select: { status: true } } },
    });

    const eligible = orders.filter(
      (o) => o.status === 'PAID' && (!o.shipment || o.shipment.status === 'FAILED' || o.shipment.status === 'CANCELLED'),
    );
    const skipped = unique
      .filter((id) => !eligible.some((o) => o.id === id))
      .map((id) => {
        const o = orders.find((x) => x.id === id);
        return { orderId: id, code: o ? orderCode(o.number) : null, reason: o ? `Estado ${o.status}` : 'No existe' };
      });
    if (eligible.length === 0) throw new BadRequestException({ message: 'Ningún pedido es apto para generar guía', skipped });

    const batch = await this.prisma.shipmentBatch.create({
      data: { createdById: adminUserId, provider: this.provider.code, totalOrders: eligible.length },
    });

    void this.processBatch(batch.id, eligible.map((o) => o.id)).catch((error) =>
      this.logger.error(`Lote ${batch.id} falló inesperadamente`, error as Error),
    );
    return { batch, skipped };
  }

  async getBatch(id: string) {
    const batch = await this.prisma.shipmentBatch.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        shipments: {
          // Mismo orden que el PDF combinado, para cotejar la pila impresa con la lista.
          orderBy: { order: { number: 'asc' } },
          include: { order: { select: { id: true, number: true, shipFullName: true, shipCityName: true, status: true } } },
        },
      },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    return {
      ...batch,
      shipments: batch.shipments.map(({ rawResponse: _raw, ...s }) => ({ ...s, order: { ...s.order, code: orderCode(s.order.number) } })),
    };
  }

  listBatches() {
    return this.prisma.shipmentBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  async batchLabels(id: string) {
    const batch = await this.prisma.shipmentBatch.findUnique({ where: { id }, select: { mergedLabelPath: true, status: true } });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    if (!batch.mergedLabelPath) throw new BadRequestException(`El lote aún no tiene guías listas (${batch.status})`);
    return this.storage.stream(batch.mergedLabelPath);
  }

  async shipmentLabel(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { labelPath: true } });
    if (!shipment?.labelPath) throw new NotFoundException('Guía no disponible');
    return this.storage.stream(shipment.labelPath);
  }

  // ------------------------------------------------------------------

  private async processBatch(batchId: string, orderIds: string[]) {
    const labelPaths: string[] = [];

    await forEachConcurrent(orderIds, this.config.get('SHIPPING_BATCH_CONCURRENCY'), async (orderId) => {
      const path = await this.processOrder(batchId, orderId);
      await this.prisma.shipmentBatch.update({
        where: { id: batchId },
        data: path ? { succeeded: { increment: 1 } } : { failed: { increment: 1 } },
      });
      if (path) labelPaths.push(path);
      this.realtime.emitToAdmins('batch.updated', { batchId, orderId, ok: Boolean(path) });
    });

    let mergedLabelPath: string | null = null;
    if (labelPaths.length > 0) {
      // Mismo orden que el pedido original para que la pila impresa coincida con la lista.
      const ordered = await this.prisma.shipment.findMany({
        where: { batchId, labelPath: { in: labelPaths } },
        orderBy: { order: { number: 'asc' } },
        select: { labelPath: true },
      });
      const pdfs = await Promise.all(ordered.map((s) => this.storage.read(s.labelPath!)));
      mergedLabelPath = await this.storage.save('labels/batches', await mergePdfs(pdfs), '.pdf');
    }

    const failed = orderIds.length - labelPaths.length;
    const status = failed === 0 ? 'COMPLETED' : labelPaths.length === 0 ? 'FAILED' : 'PARTIAL';
    await this.prisma.shipmentBatch.update({
      where: { id: batchId },
      data: { status, mergedLabelPath, completedAt: new Date() },
    });
    this.realtime.emitToAdmins('batch.updated', { batchId, status, done: true });
    this.logger.log(`Lote ${batchId}: ${labelPaths.length} guías, ${failed} fallidas`);
  }

  /** Devuelve la ruta del PDF si la guía quedó creada, o null si falló. */
  private async processOrder(batchId: string, orderId: string): Promise<string | null> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderForShipment });
    const shipment = await this.prisma.shipment.upsert({
      where: { orderId },
      create: { orderId, batchId, provider: this.provider.code, status: 'PENDING' },
      update: { batchId, provider: this.provider.code, status: 'PENDING', errorMessage: null },
    });

    try {
      const result = await this.provider.createShipment(this.buildRequest(order));
      const labelPath = await this.storage.save('labels', result.labelPdf, '.pdf');
      const shipmentData = {
        status: 'LABEL_CREATED' as const,
        carrier: result.carrier,
        trackingNumber: result.trackingNumber,
        providerShipmentId: result.providerShipmentId,
        costCop: result.costCop,
        labelPath,
        rawResponse: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      };

      try {
        await this.prisma.$transaction(async (tx) => {
          await this.orderState.transition(tx, orderId, ['PAID'], 'LABEL_GENERATED', {
            note: `Guía ${result.trackingNumber} (${result.carrier})`,
          });
          await tx.shipment.update({ where: { id: shipment.id }, data: shipmentData });
        });
      } catch (error) {
        // El pedido cambió (p. ej. lo cancelaron) mientras se creaba la guía: la guía existe en el
        // agregador y hay que anularla allá. Se deja registrada para que el admin lo vea.
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { ...shipmentData, status: 'CANCELLED', errorMessage: `Guía creada pero el pedido cambió de estado: anúlala en el agregador. ${(error as Error).message}` },
        });
        return null;
      }

      this.realtime.emitToAdmins('order.updated', { id: orderId, status: 'LABEL_GENERATED' });
      return labelPath;
    } catch (error) {
      const message = error instanceof ShippingProviderError ? error.message : `Error inesperado: ${(error as Error).message}`;
      this.logger.warn(`Guía para ${orderCode(order.number)} falló: ${message}`);
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          rawResponse: error instanceof ShippingProviderError && error.raw ? (error.raw as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      return null;
    }
  }

  private buildRequest(order: OrderForShipment): ShipmentRequest {
    const sender = this.config.sender;
    const units = order.items.reduce((sum, i) => sum + i.quantity, 0);
    const weightGrams = order.items.reduce((sum, i) => sum + i.quantity * i.variant.weightGrams, 0) + 150; // + empaque
    return {
      orderId: order.id,
      orderCode: orderCode(order.number),
      declaredValueCop: order.subtotalCop,
      collectOnDeliveryCop: 0,
      weightGrams,
      units,
      contentDescription: `Cosméticos: ${order.items.map((i) => `${i.quantity}x ${i.productName} ${i.variantName}`).join(', ')}`,
      sender: {
        fullName: sender.name,
        phone: sender.phone,
        document: sender.document,
        cityCode: sender.cityCode,
        addressLine: sender.address,
      },
      recipient: {
        fullName: order.shipFullName,
        phone: order.shipPhone,
        document: order.customer.documentNumber,
        cityCode: order.shipCityCode,
        cityName: order.shipCityName,
        departmentName: order.shipDepartmentName,
        addressLine: order.shipAddressLine,
        neighborhood: order.shipNeighborhood,
        additionalInfo: order.shipAdditionalInfo,
      },
    };
  }
}
