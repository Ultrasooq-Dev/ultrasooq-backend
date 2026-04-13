/**
 * @module VerificationController
 * @description REST API for CR verification pipeline
 * @route /api/v1/verification
 */
import {
  Controller, Post, Get, Body, Query, Request,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '../guards/AuthGuard';
import { VerificationService } from './verification.service';

@ApiTags('verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  // ─── Extract CR data (read-only, no profile update) ────────

  @Post('/cr/extract')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract data from CR document using AI' })
  async extractCR(@Body() body: { crDocumentUrl: string }) {
    return {
      status: true,
      data: await this.verificationService.extractCRData(body.crDocumentUrl),
    };
  }

  // ─── Run full pipeline (extract + fill + branches + categories) ──

  @Post('/cr/pipeline')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run full CR verification pipeline' })
  async runPipeline(
    @Request() req: any,
    @Body() body: { crDocumentUrl: string; userId?: number },
  ) {
    const userId = body.userId || req.user?.sub || req.user?.id;
    return this.verificationService.runFullPipeline(userId, body.crDocumentUrl);
  }

  // ─── Match categories from business activities ─────────────

  @Post('/cr/match-categories')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Match business activities to platform categories' })
  async matchCategories(@Body() body: { businessActivities: string[] }) {
    const matches = await this.verificationService.matchCategories(body.businessActivities);
    return { status: true, data: matches };
  }

  // ─── Suggest products for matched categories ───────────────

  @Get('/cr/suggest-products')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Suggest products based on category IDs' })
  async suggestProducts(@Query('categoryIds') categoryIds: string) {
    const ids = categoryIds.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
    const products = await this.verificationService.suggestProducts(ids);
    return { status: true, data: products };
  }

  // ─── Admin: Test verify a user's CR (read-only) ────────────

  @Post('/cr/test')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test CR verification on a user (read-only, no data updates)' })
  async testVerify(@Body() body: { userId: number }) {
    // Find the user's CR document
    const profile = await this.verificationService['prisma'].userProfile.findFirst({
      where: { userId: body.userId, deletedAt: null },
      select: { crDocument: true },
    });

    if (!profile?.crDocument) {
      return { status: false, message: 'No CR document found for this user' };
    }

    // Extract only — don't update anything
    const extracted = await this.verificationService.extractCRData(profile.crDocument);
    const matches = await this.verificationService.matchCategories(extracted.businessActivities);

    return {
      status: true,
      message: 'Test verification completed (read-only)',
      data: { extracted, categoryMatches: matches },
    };
  }
}
