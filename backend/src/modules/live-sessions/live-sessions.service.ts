import { Injectable, NotFoundException } from '@nestjs/common';
import { LiveSessionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateLiveSessionDto, UpdateLiveSessionDto, UpsertLiveItemDto } from './dto/live-session.dto';

@Injectable()
export class LiveSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.liveSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true, items: true } } },
    });
  }

  async get(id: string) {
    const live = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ displayOrder: 'asc' }],
          include: { variant: { include: { product: true, inventory: true } } },
        },
      },
    });
    if (!live) throw new NotFoundException('Live no encontrado');
    return live;
  }

  create(dto: CreateLiveSessionDto) {
    return this.prisma.liveSession.create({ data: dto });
  }

  update(id: string, dto: UpdateLiveSessionDto) {
    return this.prisma.liveSession.update({ where: { id }, data: dto });
  }

  changeStatus(id: string, status: LiveSessionStatus) {
    return this.prisma.liveSession.update({
      where: { id },
      data: {
        status,
        ...(status === 'LIVE' && { startsAt: new Date(), endedAt: null }),
        ...(status === 'ENDED' && { endedAt: new Date() }),
      },
    });
  }

  async upsertItem(liveSessionId: string, dto: UpsertLiveItemDto) {
    const { variantId, ...data } = dto;
    await this.prisma.liveSessionItem.upsert({
      where: { liveSessionId_variantId: { liveSessionId, variantId } },
      create: { liveSessionId, variantId, ...data },
      update: data,
    });
    return this.get(liveSessionId);
  }

  async removeItem(liveSessionId: string, variantId: string) {
    await this.prisma.liveSessionItem.delete({ where: { liveSessionId_variantId: { liveSessionId, variantId } } });
    return this.get(liveSessionId);
  }
}
