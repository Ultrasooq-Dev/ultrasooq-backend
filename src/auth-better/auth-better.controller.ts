/**
 * @file auth-better.controller.ts — Better Auth-aware user controller
 *
 * @intent
 *   Hosts new endpoints that operate against the Better Auth session +
 *   `BetterAuthUser` row, NOT the legacy `User` / `MasterAccount` tables.
 *   Lives next to (not inside) `src/auth/` and `src/user/` so the legacy
 *   stack remains untouched during the migration.
 *
 * @endpoints
 *   PATCH /api/v1/user/me/trade-role  — upgrade tradeRole + role-specific
 *     profile fields right after sign-up. Auth via BetterAuthGuard.
 *
 * See MIGRATION_TODO.mdx Phase 4.
 */
import {
  Body,
  Controller,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BetterAuthGuard } from './auth.guard';
import { SetTradeRoleDto, TradeRole } from './dto/set-trade-role.dto';

@Controller('user/me')
export class AuthBetterController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * PATCH /api/v1/user/me/trade-role
   *
   * Persists the role pick from register Step 3. For COMPANY, optional
   * company* fields are saved; for FREELANCER, optional accountName is saved.
   * Fields that don't match the chosen role are silently ignored — we don't
   * 400 on extras since the frontend may send a wider payload.
   */
  @Patch('trade-role')
  @UseGuards(BetterAuthGuard)
  async setTradeRole(@Req() req: any, @Body() body: SetTradeRoleDto) {
    const u = req.betterAuthUser as { id: string };

    const data: any = { tradeRole: body.tradeRole };

    if (body.tradeRole === TradeRole.COMPANY) {
      if (body.companyName !== undefined) data.companyName = body.companyName;
      if (body.companyAddress !== undefined) data.companyAddress = body.companyAddress;
      if (body.companyPhone !== undefined) data.companyPhone = body.companyPhone;
      if (body.companyWebsite !== undefined) data.companyWebsite = body.companyWebsite;
      if (body.companyTaxId !== undefined) data.companyTaxId = body.companyTaxId;
    }

    if (body.tradeRole === TradeRole.FREELANCER && body.accountName !== undefined) {
      data.accountName = body.accountName;
    }

    const updated = await this.prisma.user.update({
      where: { id: u.id },
      data,
    });

    return { status: true, data: updated };
  }
}
