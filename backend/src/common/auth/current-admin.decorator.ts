import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminRequest } from './admin-auth.guard';
import { AdminJwtPayload } from './admin-jwt.payload';

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminJwtPayload => ctx.switchToHttp().getRequest<AdminRequest>().admin,
);
