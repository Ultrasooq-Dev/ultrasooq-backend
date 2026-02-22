/**
 * @module WishlistService
 *
 * Service layer for wishlist business logic.
 * Handles CRUD operations for user wishlists using Prisma ORM.
 *
 * Key behaviors:
 * - Duplicate detection: prevents the same product from being added twice.
 * - Move-to-wishlist: when a product is added to the wishlist, it is automatically
 *   removed from the user's cart if present.
 * - Hard delete: wishlist removal permanently deletes the record (no soft delete).
 * - All list/count queries filter on `status: 'ACTIVE'`.
 *
 * Note: A module-scoped {@link PrismaClient} instance is used for all database access.
 */
import { Injectable } from '@nestjs/common';
import { Prisma, Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * Adds a product to the authenticated user's wishlist.
   *
   * Workflow:
   * 1. Check if the product is already in the user's wishlist (duplicate guard).
   *    - If yes, return early with `status: false` and the existing record.
   * 2. Create a new wishlist record for the user + product.
   * 3. Check if the same product exists in the user's cart.
   *    - If yes, hard-delete the cart entry (move-to-wishlist behavior).
   * 4. Return the newly created wishlist record.
   *
   * Note: The success response key is `messsage` (three s's) -- a known typo
   * preserved here to maintain API compatibility.
   *
   * @param payload - Request body; expected shape: `{ productId: number }`.
   * @param req     - Express request object; `req.user.id` provides the authenticated user ID.
   * @returns Object with `status`, `messsage`/`message`, and `data`.
   */
  // wishList
  async addWishList(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const productId = payload?.productId;

      // Check for duplicate: does this product already exist in the user's wishlist?
      let existWishlist = await this.prisma.wishlist.findFirst({
        where: {
          userId: userId,
          productId: productId,
        }
      });

      // If already wishlisted, return early without creating a duplicate
      if (existWishlist) {
        return {
          status: false,
          message: 'Already Added In Wishlist',
          data: existWishlist
        }
      }

      // Create the new wishlist entry
      let addWishList = await this.prisma.wishlist.create({
        data: {
          userId: userId,
          productId: productId,
        }
      });

      // Side effect: if the product is in the user's cart, remove it (move-to-wishlist)
      let productExistInCart = await this.prisma.cart.findFirst({
        where: {
          userId: userId,
          productId: productId,
        }
      })

      if (productExistInCart) {
        let deleteCart = await this.prisma.cart.delete({
          where: { id: productExistInCart.id }
        })
      }

      return {
        status: true,
        messsage: 'Created Successfully',
        data: addWishList
      }

    } catch (error) {
      return {
        status: false,
        message: "error, in addWishList",
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * Retrieves a paginated list of active wishlist items for the authenticated user.
   *
   * Each wishlist item includes deep-nested product details:
   * - `productImages`           -- all images for the product.
   * - `productReview`           -- active reviews with `rating` field (for avg rating calculation).
   * - `product_productPrice`    -- the single lowest-priced active offer (`orderBy offerPrice ASC`,
   *                                `take: 1`), including seller/admin details and their profile.
   * - `product_productShortDescription` -- active short description records.
   *
   * Pagination defaults: page = 1, pageSize = 10.
   *
   * @param page  - Requested page number (1-indexed). Falls back to 1 if falsy or non-numeric.
   * @param limit - Number of items per page. Falls back to 10 if falsy or non-numeric.
   * @param req   - Express request object; `req.user.id` provides the authenticated user ID.
   * @returns Object with `status`, `message`, `data` (array of wishlist items), and `totalCount`.
   */
  async getAllWishListByUser(page: any, limit: any, req: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      const userId = req?.user?.id;

      let getAllWishListByUser = await this.prisma.wishlist.findMany({
        where: {
          status: 'ACTIVE',
          userId: userId
        },
        include: {
          // Deep include: product details with images, reviews, pricing, and descriptions
          wishlist_productDetail: {
            include: {
              productImages: true,
              // Only active reviews; select rating for average calculation
              productReview: {
                where: { status: 'ACTIVE' },
                select: {
                  rating: true
                }
              },
              // Lowest-priced active offer with seller profile info
              product_productPrice: {
                where: { status: 'ACTIVE'},
                include: {
                  adminDetail:{
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      profilePicture: true,
                      tradeRole: true,
                      userProfile: {
                        select: {
                          profileType: true,
                          logo: true,
                          companyName: true
                        }
                      }
                    }
                  }
                },
                orderBy: {
                  offerPrice: 'asc'
                },
                take: 1 // Limit the result to only 1 row
              },
              // Active short descriptions for the product
              product_productShortDescription: { where: { status: 'ACTIVE' } },
            }
          }
        },
        skip,
        take: pageSize
      });

      // Total count of active wishlist items for pagination metadata
      let getAllWishListByUserCount = await this.prisma.wishlist.count({
        where: {
          status: 'ACTIVE',
          userId: userId
        }
      });

      if (!getAllWishListByUser) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllWishListByUser,
        totalCount: getAllWishListByUserCount
      }

    } catch (error) {
      return {
        status: false,
        message: "error, in getAllWishListByUser",
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * Deletes a product from the authenticated user's wishlist.
   *
   * Lookup is performed by userId + productId. If no matching record is found,
   * returns a "Not Found" response. Otherwise, the record is hard-deleted
   * (permanently removed from the database -- not a soft delete).
   *
   * @param productId - The product ID to remove (passed as query param, parsed to int).
   * @param req       - Express request object; `req.user.id` provides the authenticated user ID.
   * @returns Object with `status`, `message`, and empty `data` array.
   */
  async deleteWishList(productId: any, req: any) {
    try {
      const userId = req?.user?.id;
      const productID = parseInt(productId);

      // Look up the wishlist entry by user and product
      let existWishList = await this.prisma.wishlist.findFirst({
        where: {
          userId: userId,
          productId: productID
        }
      });

      // If no record found, return early
      if (!existWishList) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      // Hard delete: permanently removes the record from the database
      let deleteWishList = await this.prisma.wishlist.delete({
        where: { id: existWishList.id }
      });

      return {
        status: true,
        message: "Deleted Successfully",
        data: []
      }

    } catch (error) {
      return {
        status: false,
        message: "error, in deleteWishList",
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * Returns the total count of active wishlist items for the authenticated user.
   *
   * Counts only records where `status` is `'ACTIVE'`.
   *
   * @param req - Express request object; `req.user.id` provides the authenticated user ID.
   * @returns Object with `status`, `message`, and `data` (the count as a number).
   */
  async wishlistCount(req: any) {
    try {
      const userId = req?.user?.id;

      // Count all active wishlist entries for this user
      let getAllWishListByUserCount = await this.prisma.wishlist.count({
        where: {
          status: 'ACTIVE',
          userId: userId
        }
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllWishListByUserCount,
      }


    } catch (error) {
      return {
        status: false,
        message: "error, in wishlistCount",
        error: getErrorMessage(error)
      }
    }
  }

}
