import { Module } from '@nestjs/common';
import { LiveSessionsController } from './live-sessions.controller';
import { LiveSessionsService } from './live-sessions.service';

@Module({
  controllers: [LiveSessionsController],
  providers: [LiveSessionsService],
})
export class LiveSessionsModule {}
