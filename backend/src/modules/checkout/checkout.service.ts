import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { orderCode } from '../../common/utils/order-code';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStateService } from '../orders/order-state.service';
import { CheckoutDto, SubmitPaymentDto } from './dto/checkout.dto';
import { ShippingRatePolicy } from './shipping-rate.policy';

type LiveWithItems = Prisma.LiveSessionGetPayload<{
  include: { items: { include: { variant: { include: { product: true; inventory: true } } } } };
}>;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orderState: OrderStateService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
    private readonly shippingRate: ShippingRatePolicy,
    private readonly config: AppConfig,
  ) {}

  // ------------------------------------------------------------------
  // Catálogo del Live
  // ------------------------------------------------------------------

  async getLive(slug: string) {
    const live = await this.loadLive(slug);
    return {
      id: live.id,
      slug: live.slug,
      title: live.title,
      status: live.status,
      checkoutOpen: this.isCheckoutOpen(live),
      reservationMinutes: live.reservationMinutes,
      shipping: this.shippingRate.describe(),
      payment: this.config.paymentInstructions,
      items: live.items
        .filter((i) => i.active && i.variant.active && i.variant.product.active)
        .map((i) => ({
          variantId: i.variantId,
          sku: i.variant.sku,
          productName: i.variant.product.name,
          brand: i.variant.product.brand,
          variantName: i.variant.name,
          imageUrl: i.variant.imageUrl ?? i.variant.product.imageUrl,
          priceCop: i.livePriceCop ?? i.variant.priceCop,
          regularPriceCop: i.variant.priceCop,
          maxPerOrder: i.maxPerOrder,
          available: Math.max((i.variant.inventory?.onHand ?? 0) - (i.variant.inventory?.reserved ?? 0), 0),
        })),
    };
  }

  // ------------------------------------------------------------------
  // Crear pedido + reservar stock (todo o nada)
  // ------------------------------------------------------------------

  async createOrder(slug: string, dto: CheckoutDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey }, select: { publicToken: true } });
      if (existing) return this.getPublicOrder(existing.publicToken);
    }

    const live = await this.loadLive(slug);
    if (!this.isCheckoutOpen(live)) throw new GoneException('Este Live ya no recibe pedidos');

    const lines = this.priceLines(live, dto);
    const city = await this.prisma.city.findUnique({ where: { code: dto.shipping.cityCode }, include: { department: true } });
    if (!city) throw new BadRequestException('Ciudad no encontrada');

    const subtotalCop = lines.reduce((sum, l) => sum + l.lineTotalCop, 0);
    const shippingCop = this.shippingRate.costFor(subtotalCop, city.code);
    const reservedUntil = new Date(Date.now() + live.reservationMinutes * 60_000);

    let publicToken: string;
    try {
      publicToken = await this.prisma.$transaction(async (tx) => {
        const { customer: c, shipping: s } = dto;
        const customer = await tx.customer.upsert({
          where: { documentType_documentNumber: { documentType: c.documentType, documentNumber: c.documentNumber } },
          create: { ...c },
          update: { fullName: c.fullName, phone: c.phone, email: c.email, tiktokUsername: c.tiktokUsername },
        });
        await this.rememberAddress(tx, customer.id, dto);

        const order = await tx.order.create({
          data: {
            idempotencyKey,
            customerId: customer.id,
            liveSessionId: live.id,
            subtotalCop,
            shippingCop,
            totalCop: subtotalCop + shippingCop,
            reservedUntil,
            shipFullName: c.fullName,
            shipPhone: c.phone,
            shipCityCode: city.code,
            shipCityName: city.name,
            shipDepartmentName: city.department.name,
            shipAddressLine: s.addressLine,
            shipNeighborhood: s.neighborhood,
            shipAdditionalInfo: s.additionalInfo,
            customerNotes: dto.notes,
            items: { create: lines },
            history: { create: { toStatus: 'PENDING_PAYMENT', note: 'Pedido creado desde el checkout' } },
          },
        });

        // Si algún producto se agotó, lanza OutOfStockException y TODO lo anterior hace rollback.
        await this.inventory.reserve(tx, order.id, lines);
        return order.publicToken;
      });
    } catch (error) {
      // Dos peticiones con la misma Idempotency-Key en paralelo: gana una, la otra devuelve el mismo pedido.
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.order.findUnique({ where: { idempotencyKey }, select: { publicToken: true } });
        if (existing) return this.getPublicOrder(existing.publicToken);
      }
      throw error;
    }

    await this.inventory.broadcast(lines.map((l) => l.variantId));
    const order = await this.getPublicOrder(publicToken);
    this.realtime.emitToAdmins('order.created', { id: order.id, code: order.code, totalCop: order.totalCop });
    return order;
  }

  // ------------------------------------------------------------------
  // Comprobante de pago
  // ------------------------------------------------------------------

  async submitPayment(publicToken: string, dto: SubmitPaymentDto, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Adjunta la foto o PDF del comprobante');
    if (!StorageService.isAllowedReceipt(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Formato no permitido. Usa JPG, PNG, WEBP, HEIC o PDF');
    }
    if (file.size > this.config.get('MAX_RECEIPT_MB') * 1024 * 1024) {
      throw new PayloadTooLargeException(`El comprobante supera ${this.config.get('MAX_RECEIPT_MB')} MB`);
    }

    const order = await this.prisma.order.findUnique({ where: { publicToken }, select: { id: true, status: true, totalCop: true } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status === 'EXPIRED') throw new GoneException('La reserva de este pedido venció. Haz un nuevo pedido.');
    if (order.status !== 'PENDING_PAYMENT') throw new ConflictException('Este pedido ya tiene un comprobante en revisión o fue procesado');

    const receiptPath = await this.storage.save('receipts', file.buffer, StorageService.extensionFor(file.mimetype, file.originalname));

    // Si el job de expiración gana la carrera, la transición falla con 409 y el pedido queda EXPIRED.
    const payment = await this.prisma.$transaction(async (tx) => {
      await this.orderState.transition(tx, order.id, ['PENDING_PAYMENT'], 'PAYMENT_REVIEW', {
        note: `Comprobante ${dto.method} subido por el cliente`,
        data: { reservedUntil: null },
      });
      return tx.payment.create({
        data: {
          orderId: order.id,
          method: dto.method,
          reference: dto.reference,
          amountCop: order.totalCop,
          receiptPath,
          receiptMimeType: file.mimetype,
        },
      });
    });

    this.realtime.emitToAdmins('payment.submitted', { orderId: order.id, paymentId: payment.id });
    return this.getPublicOrder(publicToken);
  }

  // ------------------------------------------------------------------
  // Vista pública del pedido (seguimiento)
  // ------------------------------------------------------------------

  async getPublicOrder(publicToken: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicToken },
      include: {
        items: { select: { productName: true, variantName: true, quantity: true, unitPriceCop: true, lineTotalCop: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, method: true, rejectionReason: true, createdAt: true } },
        shipment: { select: { carrier: true, trackingNumber: true, status: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    return {
      id: order.id,
      publicToken: order.publicToken,
      code: orderCode(order.number),
      status: order.status,
      createdAt: order.createdAt,
      reservedUntil: order.reservedUntil,
      items: order.items,
      subtotalCop: order.subtotalCop,
      shippingCop: order.shippingCop,
      discountCop: order.discountCop,
      totalCop: order.totalCop,
      shipping: {
        fullName: order.shipFullName,
        city: `${order.shipCityName}, ${order.shipDepartmentName}`,
        addressLine: order.shipAddressLine,
      },
      lastPayment: order.payments[0] ?? null,
      shipment: order.shipment,
      payment: order.status === 'PENDING_PAYMENT' ? this.config.paymentInstructions : undefined,
    };
  }

  // ------------------------------------------------------------------

  private async loadLive(slug: string): Promise<LiveWithItems> {
    const live = await this.prisma.liveSession.findUnique({
      where: { slug },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: { variant: { include: { product: true, inventory: true } } },
        },
      },
    });
    if (!live) throw new NotFoundException('Live no encontrado');
    return live;
  }

  private isCheckoutOpen(live: { status: string; endedAt: Date | null }): boolean {
    if (live.status === 'LIVE') return true;
    if (live.status === 'ENDED' && live.endedAt) {
      return Date.now() - live.endedAt.getTime() < this.config.get('CHECKOUT_GRACE_HOURS') * 3_600_000;
    }
    return false;
  }

  /** Precios SIEMPRE del servidor: nunca se confía en el precio que manda el navegador. */
  private priceLines(live: LiveWithItems, dto: CheckoutDto) {
    const byVariant = new Map(live.items.map((i) => [i.variantId, i]));
    const quantities = new Map<string, number>();
    for (const { variantId, quantity } of dto.items) quantities.set(variantId, (quantities.get(variantId) ?? 0) + quantity);

    return [...quantities.entries()].map(([variantId, quantity]) => {
      const item = byVariant.get(variantId);
      if (!item || !item.active || !item.variant.active || !item.variant.product.active) {
        throw new BadRequestException(`El producto ${variantId} no está disponible en este Live`);
      }
      if (quantity > item.maxPerOrder) {
        throw new BadRequestException(`Máximo ${item.maxPerOrder} unidades de "${item.variant.name}" por pedido`);
      }
      const unitPriceCop = item.livePriceCop ?? item.variant.priceCop;
      return {
        variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        unitPriceCop,
        quantity,
        lineTotalCop: unitPriceCop * quantity,
      };
    });
  }

  private async rememberAddress(tx: Prisma.TransactionClient, customerId: string, dto: CheckoutDto) {
    const { cityCode, addressLine, neighborhood, additionalInfo } = dto.shipping;
    const known = await tx.customerAddress.findFirst({ where: { customerId, cityCode, addressLine } });
    if (!known) await tx.customerAddress.create({ data: { customerId, cityCode, addressLine, neighborhood, additionalInfo } });
  }
}
