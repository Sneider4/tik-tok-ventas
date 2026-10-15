import { Controller, Get, Header, Param } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Catálogo DANE para los selectores Departamento → Ciudad del checkout. */
@Controller('public/locations')
export class LocationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('departments')
  @Header('Cache-Control', 'public, max-age=86400')
  departments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('departments/:code/cities')
  @Header('Cache-Control', 'public, max-age=86400')
  cities(@Param('code') code: string) {
    return this.prisma.city.findMany({
      where: { departmentCode: code },
      orderBy: { name: 'asc' },
      select: { code: true, name: true },
    });
  }
}
