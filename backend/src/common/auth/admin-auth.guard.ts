import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AdminJwtPayload } from './admin-jwt.payload';

export interface AdminRequest extends Request {
  admin: AdminJwtPayload;
}

/** Protege los endpoints /admin con el JWT emitido en /auth/login. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token requerido');

    try {
      request.admin = await this.jwt.verifyAsync<AdminJwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
  }
}
