/**
 * @module SpecificationController
 * @description REST API endpoints for spec templates, spec values, filters, and category keywords.
 * @routes
 *   POST   /specification/template              — Create spec template (admin)
 *   POST   /specification/template/bulk          — Bulk create templates
 *   GET    /specification/template/:categoryId   — Get templates for category
 *   GET    /specification/template/multi          — Get templates for multiple categories
 *   PATCH  /specification/template/:id            — Update template
 *   DELETE /specification/template/:id            — Soft-delete template
 *
 *   POST   /specification/value                  — Set spec values for product
 *   GET    /specification/value/:productId       — Get spec values for product
 *   PATCH  /specification/value/:id              — Update single spec value
 *
 *   GET    /specification/filters/:categoryId    — Get filterable specs with values
 *
 *   POST   /specification/keywords/:categoryId   — Add category keywords
 *   GET    /specification/keywords/:categoryId   — Get category keywords
 *   POST   /specification/match-categories       — Match text to categories
 *
 *   POST   /specification/product-categories/:productId — Set product categories
 *   GET    /specification/product-categories/:productId — Get product categories
 *   POST   /specification/auto-categorize/:productId    — Auto-categorize product
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SpecificationService } from './specification.service';
import { CreateSpecTemplateDto, UpdateSpecTemplateDto, BulkCreateSpecTemplateDto } from './dto/create-spec-template.dto';
import { CreateSpecValuesDto, UpdateSpecValueDto } from './dto/create-spec-value.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('specifications')
@Controller('specification')
export class SpecificationController {
  constructor(private readonly specService: SpecificationService) {}

  // ── Spec Templates ──

  @Post('template')
  createTemplate(@Body() dto: CreateSpecTemplateDto) {
    return this.specService.createTemplate(dto);
  }

  @Post('template/bulk')
  bulkCreateTemplates(@Body() dto: BulkCreateSpecTemplateDto) {
    return this.specService.bulkCreateTemplates(dto);
  }

  @Get('template/:categoryId')
  getTemplates(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.specService.getTemplatesByCategory(categoryId);
  }

  @Get('template/multi')
  getTemplatesForCategories(@Query('ids') ids: string) {
    const categoryIds = ids.split(',').map(Number).filter(Boolean);
    return this.specService.getTemplatesForCategories(categoryIds);
  }

  @Patch('template/:id')
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSpecTemplateDto) {
    return this.specService.updateTemplate(id, dto);
  }

  @Delete('template/:id')
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.specService.deleteTemplate(id);
  }

  // ── Spec Values ──

  @Post('value')
  setSpecValues(@Body() dto: CreateSpecValuesDto) {
    return this.specService.setSpecValues(dto);
  }

  @Get('value/:productId')
  getSpecValues(@Param('productId', ParseIntPipe) productId: number) {
    return this.specService.getSpecValues(productId);
  }

  @Patch('value/:id')
  updateSpecValue(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSpecValueDto) {
    return this.specService.updateSpecValue(id, dto);
  }

  // ── Filters ──

  @Get('filters/:categoryId')
  getFilters(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.specService.getFilters(categoryId);
  }

  // ── Category Keywords ──

  @Post('keywords/:categoryId')
  addKeywords(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() body: { keywords: string[] },
  ) {
    return this.specService.addCategoryKeywords(categoryId, body.keywords);
  }

  @Get('keywords/:categoryId')
  getKeywords(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.specService.getCategoryKeywords(categoryId);
  }

  @Post('match-categories')
  @HttpCode(HttpStatus.OK)
  matchCategories(@Body() body: { text: string }) {
    return this.specService.matchCategories(body.text);
  }

  // ── Product Categories (Multi-Category) ──

  @Post('product-categories/:productId')
  setProductCategories(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: { categoryIds: number[]; primaryCategoryId?: number },
  ) {
    return this.specService.setProductCategories(productId, body.categoryIds, body.primaryCategoryId);
  }

  @Get('product-categories/:productId')
  getProductCategories(@Param('productId', ParseIntPipe) productId: number) {
    return this.specService.getProductCategories(productId);
  }

  @Post('auto-categorize/:productId')
  @HttpCode(HttpStatus.OK)
  autoCategorize(@Param('productId', ParseIntPipe) productId: number) {
    return this.specService.autoCategorize(productId);
  }

  // ── Category Tags (Tags as Universal Connector) ──

  @Post('category-tags/:categoryId')
  addCategoryTags(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() body: { tagIds: number[] },
  ) {
    return this.specService.addCategoryTags(categoryId, body.tagIds);
  }

  @Get('category-tags/:categoryId')
  getCategoryTags(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.specService.getCategoryTags(categoryId);
  }

  @Delete('category-tags/:categoryId/:tagId')
  removeCategoryTag(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ) {
    return this.specService.removeCategoryTag(categoryId, tagId);
  }

  @Post('category-tags/:categoryId/set')
  @HttpCode(HttpStatus.OK)
  setCategoryTags(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() body: { tagIds: number[] },
  ) {
    return this.specService.setCategoryTags(categoryId, body.tagIds);
  }

  // ── Tag Management (Enhanced CRUD) ──

  @Get('tags')
  listTags(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.specService.listTags(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('tags/search')
  searchTags(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.specService.searchTags(q || '', limit ? parseInt(limit, 10) : 20);
  }

  @Get('tags/:tagId')
  getTagById(@Param('tagId', ParseIntPipe) tagId: number) {
    return this.specService.getTagById(tagId);
  }

  @Patch('tags/:tagId')
  updateTag(
    @Param('tagId', ParseIntPipe) tagId: number,
    @Body() body: { tagName: string },
  ) {
    return this.specService.updateTag(tagId, body);
  }

  @Delete('tags/:tagId')
  deleteTag(@Param('tagId', ParseIntPipe) tagId: number) {
    return this.specService.deleteTag(tagId);
  }

  // ── Tag-Based Matching ──

  @Post('match-categories-by-tags')
  @HttpCode(HttpStatus.OK)
  matchCategoriesByTags(@Body() body: { tagIds: number[] }) {
    return this.specService.matchCategoriesByTags(body.tagIds);
  }

  // ── Service Categories (Multi-Category) ──

  @Post('service-categories/:serviceId')
  setServiceCategories(
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Body() body: { categoryIds: number[]; primaryCategoryId?: number },
  ) {
    return this.specService.setServiceCategories(serviceId, body.categoryIds, body.primaryCategoryId);
  }

  @Get('service-categories/:serviceId')
  getServiceCategories(@Param('serviceId', ParseIntPipe) serviceId: number) {
    return this.specService.getServiceCategories(serviceId);
  }

  @Post('auto-categorize-service/:serviceId')
  @HttpCode(HttpStatus.OK)
  autoCategorizeService(@Param('serviceId', ParseIntPipe) serviceId: number) {
    return this.specService.autoCategorizeService(serviceId);
  }
}
