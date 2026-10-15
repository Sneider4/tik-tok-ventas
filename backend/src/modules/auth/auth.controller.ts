import { Body, Controller, Get, HttpCode, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString() @MinLength(6)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: dto.email.toLowerCase() } });
    const valid = admin?.active && (await bcrypt.compare(dto.password, admin.passwordHash));
    if (!admin || !valid) throw new UnauthorizedException('Credenciales inválidas');

    const payload: AdminJwtPayload = { sub: admin.id, email: admin.email, role: admin.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    };
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  async me(@CurrentAdmin() current: AdminJwtPayload) {
    return this.prisma.adminUser.findUniqueOrThrow({
      where: { id: current.sub },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }
}
