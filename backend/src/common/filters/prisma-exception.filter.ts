import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Traduce errores conocidos de Prisma a respuestas HTTP con sentido. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'El registro ya existe'],
      P2025: [HttpStatus.NOT_FOUND, 'Registro no encontrado'],
      P2003: [HttpStatus.BAD_REQUEST, 'Referencia inválida'],
    };
    const [status, message] = map[exception.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Error de base de datos'];
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception.message, exception.stack);

    response.status(status).json({ statusCode: status, message, code: exception.code });
  }
}
