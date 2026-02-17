/**
 * HelperService
 *
 * @intent    Provides utility functions for resolving admin ownership and
 *            Paymob payment integration.
 * @idea      Helper functions that multiple services need — admin ID resolution
 *            for multi-user hierarchy, and payment gateway auth.
 * @usage     Injected by UserService, ProductService, OrderService, etc.
 * @dataflow  userId -> DB lookup -> resolved admin ID; or
 *            Paymob credentials -> API -> auth token.
 * @depends   @prisma/client, axios, process.env for Paymob credentials.
 * @notes     PrismaClient instantiated at module scope — not managed by DI.
 *            Paymob integration targets Oman region.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const axios = require("axios");

const PAYMOB_OMAN_API_URL = "https://oman.paymob.com/api";

@Injectable()
export class HelperService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Resolves the actual admin/owner ID for a given user.
   *
   * If the user's tradeRole is MEMBER (i.e. a team member added by a seller),
   * returns their `addedBy` value (the parent seller's ID). Otherwise returns
   * the userId itself, treating the caller as the owner.
   *
   * Used for ownership scoping throughout the app — ensures that queries
   * and mutations operate under the correct seller/admin context regardless
   * of whether the request comes from the owner or one of their team members.
   *
   * @param   userId - The ID of the currently authenticated user.
   * @returns The resolved admin/owner ID, or null if userId is falsy.
   */
  async getAdminId(userId: number): Promise<number | null> {
    if (!userId) return null; // Handle case where userId is undefined

    const adminDetail = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tradeRole: true, addedBy: true },
    });

    return adminDetail?.tradeRole === 'MEMBER' ? adminDetail.addedBy : userId;
  }

  /**
   * Similar to getAdminId but for ADMINMEMBER type users.
   *
   * If the user's tradeRole is ADMINMEMBER (an admin team member), returns
   * their `addedBy` value (the parent super-admin's ID). Otherwise returns
   * the userId itself.
   *
   * Used in admin module contexts where the caller might be a sub-admin
   * acting on behalf of the super-admin.
   *
   * @param   userId - The ID of the currently authenticated admin user.
   * @returns The resolved super-admin/sub-admin ID, or null if userId is falsy.
   */
  async getSuperAdminORSubAdminId(userId: number): Promise<number | null> {
    if (!userId) return null; // Handle case where userId is undefined

    const adminDetail = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tradeRole: true, addedBy: true },
    });

    return adminDetail?.tradeRole === 'ADMINMEMBER' ? adminDetail.addedBy : userId;
  }

  /**
   * Authenticates with the Paymob Oman API to obtain a session token.
   *
   * Sends the Paymob username and password (read from environment variables
   * PAYMOB_USERNAME and PAYMOB_PASSWORD) to the Paymob auth endpoint.
   * The returned token is required for subsequent Paymob API calls such as
   * creating payment orders.
   *
   * Called before creating payment orders to ensure a valid auth session.
   *
   * @returns The Paymob authentication token string.
   * @throws  Error if the authentication request fails.
   */
  async getAuthToken() {
    try {
      const response = await axios.post(`${PAYMOB_OMAN_API_URL}/auth/tokens`, {
        username: process.env.PAYMOB_USERNAME, // Your Paymob account username
        password: process.env.PAYMOB_PASSWORD, // Your Paymob account password
      });


      return response.data.token;
    } catch (error) {
      throw new Error("Failed to get authentication token");
    }
  }

}
