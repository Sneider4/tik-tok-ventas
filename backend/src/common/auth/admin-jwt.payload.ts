import { AdminRole } from '@prisma/client';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
}
