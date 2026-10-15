import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AppConfig } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);

  app.setGlobalPrefix('api');
  // Detrás de un proxy (Railway, Render, Nginx) para que el rate-limit vea la IP real.
  app.set('trust proxy', 1);
  app.enableCors({
    origin: config.get('CORS_ORIGINS').split(',').map((o) => o.trim()),
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();

  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(`API lista en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
