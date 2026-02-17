/**
 * @module SpecificationModule
 * @description Module for specification templates, product spec values, filters, and category keywords.
 *   Manages the relationship between categories and their specification definitions,
 *   product-level spec values, and auto-generates filterable facets.
 * @exports SpecificationService
 * @routes /specification/*
 */
import { Module } from '@nestjs/common';
import { SpecificationController } from './specification.controller';
import { SpecificationService } from './specification.service';

@Module({
  controllers: [SpecificationController],
  providers: [SpecificationService],
  exports: [SpecificationService],
})
export class SpecificationModule {}
