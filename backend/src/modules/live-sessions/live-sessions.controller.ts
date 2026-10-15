import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import {
  ChangeLiveStatusDto,
  CreateLiveSessionDto,
  UpdateLiveSessionDto,
  UpsertLiveItemDto,
} from './dto/live-session.dto';
import { LiveSessionsService } from './live-sessions.service';

@Controller('admin/lives')
@UseGuards(AdminAuthGuard)
export class LiveSessionsController {
  constructor(private readonly lives: LiveSessionsService) {}

  @Get()
  list() {
    return this.lives.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.lives.get(id);
  }

  @Post()
  create(@Body() dto: CreateLiveSessionDto) {
    return this.lives.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLiveSessionDto) {
    return this.lives.update(id, dto);
  }

  @Post(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeLiveStatusDto) {
    return this.lives.changeStatus(id, dto.status);
  }

  @Put(':id/items')
  upsertItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertLiveItemDto) {
    return this.lives.upsertItem(id, dto);
  }

  @Delete(':id/items/:variantId')
  removeItem(@Param('id', ParseUUIDPipe) id: string, @Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.lives.removeItem(id, variantId);
  }
}
