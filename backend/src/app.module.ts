import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LiveSessionsModule } from './modules/live-sessions/live-sessions.module';
import { LocationsModule } from './modules/locations/locations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ShippingModule } from './modules/shipping/shipping.module';

@Module({
  imports: [
    // Infraestructura
    AppConfigModule,
    PrismaModule,
    StorageModule,
    RealtimeModule,
    ScheduleModule.forRoot(),
    // Límite general por IP; los endpoints sensibles (login, checkout) tienen uno más estricto.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') as `${number}h` },
      }),
    }),
    // Negocio
    AuthModule,
    CatalogModule,
    InventoryModule,
    LiveSessionsModule,
    LocationsModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
