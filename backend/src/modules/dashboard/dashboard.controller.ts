import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Inicio del día en Colombia (UTC-5, sin horario de verano). */
function startOfTodayBogota(now = new Date()): Date {
  const bogota = new Date(now.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate(), 5));
}

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary() {
    const today = startOfTodayBogota();
    const [byStatus, salesToday, ordersToday, pendingPayments, lowStock] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { paidAt: { gte: today }, status: { notIn: ['CANCELLED'] } },
        _sum: { totalCop: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.payment.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM inventory_items WHERE "onHand" - "reserved" <= "lowStockThreshold"`,
    ]);

    return {
      ordersByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      today: {
        ordersCreated: ordersToday,
        ordersPaid: salesToday._count._all,
        salesCop: salesToday._sum.totalCop ?? 0,
      },
      pendingPayments,
      lowStockVariants: Number(lowStock[0]?.count ?? 0),
    };
  }
}
