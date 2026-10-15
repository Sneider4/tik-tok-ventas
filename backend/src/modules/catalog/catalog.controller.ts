import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AdminJwtPayload } from '../../common/auth/admin-jwt.payload';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { CatalogService } from './catalog.service';
import { CreateProductDto, CreateVariantDto, ProductQueryDto, UpdateProductDto, UpdateVariantDto } from './dto/catalog.dto';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  list(@Query() query: ProductQueryDto) {
    return this.catalog.list(query);
  }

  @Get('products/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.get(id);
  }

  @Post('products')
  create(@Body() dto: CreateProductDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.catalog.create(dto, admin.sub);
  }

  @Patch('products/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.update(id, dto);
  }

  @Post('products/:id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.catalog.addVariant(id, dto, admin.sub);
  }

  @Patch('variants/:variantId')
  updateVariant(@Param('variantId', ParseUUIDPipe) variantId: string, @Body() dto: UpdateVariantDto) {
    return this.catalog.updateVariant(variantId, dto);
  }
}
