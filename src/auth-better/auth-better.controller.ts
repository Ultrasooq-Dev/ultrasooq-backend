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
import { UserService } from '../user/user.service';

@Controller('user/me')
export class AuthBetterController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  /**
   * PATCH /api/v1/user/me/trade-role
   *
   * Persists the role pick from register Step 3. For COMPANY, optional
   * company* fields are saved; for FREELANCER, optional accountName is saved.
   * Fields that don't match the chosen role are silently ignored — we don't
   * 400 on extras since the frontend may send a wider payload.
   *
   * Strips `password` (and any other sensitive columns) from the response by
   * destructuring before returning so the bcrypt hash is never sent to the client.
   */
  @Patch('trade-role')
  @UseGuards(BetterAuthGuard)
  async setTradeRole(@Req() req: any, @Body() body: SetTradeRoleDto) {
    const u = req.betterAuthUser as { id: string };

    // Model: every user's master row is permanently BUYER (so they can always
    // shop). COMPANY and FREELANCER are sub-accounts under that buyer master.
    // Step 3 of registration calls this endpoint with the role the user picked.

    // Case 1 — BUYER: master is already BUYER, nothing to do. Return current.
    if (body.tradeRole === TradeRole.BUYER) {
      const current = await this.prisma.user.findUnique({
        where: { id: u.id },
      });
      if (!current) return { status: false, message: 'User not found' };
      const { password, ...safeUser } = current as any;
      return {
        status: true,
        data: { ...safeUser, subAccountCreated: false, masterIsBuyer: true },
      };
    }

    // Case 2 — COMPANY / FREELANCER: spawn a sub-account that goes through
    // admin approval. Leave the master untouched so the user can keep
    // shopping immediately as a buyer; the sub becomes switchable once admin
    // flips it to ACTIVE.
    const master = await this.prisma.user.findUnique({ where: { id: u.id } });
    if (!master) return { status: false, message: 'User not found' };

    const subPayload: any = {
      tradeRole: body.tradeRole,
      accountName:
        body.accountName?.trim() ||
        body.companyName?.trim() ||
        `My ${body.tradeRole} Account`,
    };
    if (body.tradeRole === TradeRole.COMPANY) {
      if (body.companyName !== undefined) subPayload.companyName = body.companyName;
      if (body.companyAddress !== undefined) subPayload.companyAddress = body.companyAddress;
      if (body.companyPhone !== undefined) subPayload.companyPhone = body.companyPhone;
      if (body.companyWebsite !== undefined) subPayload.companyWebsite = body.companyWebsite;
      if (body.companyTaxId !== undefined) subPayload.companyTaxId = body.companyTaxId;
    }

    const result = await this.userService.createAccount(subPayload, {
      user: master,
    });

    // Mirror the previous response shape but flag that a sub was created so
    // the frontend can show a "pending review" toast without signing the
    // user out (the master is still active).
    if (result?.status && result?.data) {
      return {
        status: true,
        data: {
          ...master,
          subAccountCreated: true,
          masterIsBuyer: true,
          subAccount: result.data,
        },
      };
    }
    return result;
  }
}
