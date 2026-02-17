/**
 * @module WishlistController
 *
 * REST controller for wishlist operations.
 * All routes are prefixed with `/wishlist` and require an authenticated user
 * (enforced by {@link AuthGuard} on every endpoint).
 *
 * Delegates all business logic to {@link WishlistService}.
 */
import { Body, Controller, Get, Post, UseGuards, Request, UploadedFiles, UseInterceptors, Patch, Query, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth('JWT-auth')
@Controller('wishlist')
export class WishlistController {

  constructor(
    private readonly wishlistService: WishlistService,
  ) {}

  /**
   * POST /wishlist/create
   *
   * Adds a product to the authenticated user's wishlist.
   * If the product already exists in the wishlist, returns a duplicate notice.
   * Side effect: if the product is currently in the user's cart, it is removed
   * from the cart (move-to-wishlist behavior).
   *
   * @param req     - Express request object; `req.user.id` provides the authenticated user ID.
   * @param payload - Request body containing `productId` (number).
   * @returns Object with `status`, `messsage` (note: three-s typo in source), and `data`.
   */
  @UseGuards(AuthGuard)
  @Post('/create')
  addWishList(@Request() req, @Body() payload: any) {
    return this.wishlistService.addWishList(payload, req);
  }

  /**
   * GET /wishlist/getAllWishListByUser
   *
   * Retrieves a paginated list of the authenticated user's active wishlist items.
   * Each item includes deep product details: images, reviews (for average rating
   * calculation), the lowest-priced product price with seller info, and short
   * descriptions.
   *
   * @param req   - Express request object; `req.user.id` provides the authenticated user ID.
   * @param page  - Page number (defaults to 1 if not provided or invalid).
   * @param limit - Items per page (defaults to 10 if not provided or invalid).
   * @returns Object with `status`, `message`, `data` (wishlist items array), and `totalCount`.
   */
  @UseGuards(AuthGuard)
  @Get('/getAllWishListByUser')
  getAllWishListByUser(@Request() req, @Query('page') page: number, @Query('limit') limit: number) {
    return this.wishlistService.getAllWishListByUser(page, limit, req);
  }

  /**
   * DELETE /wishlist/delete
   *
   * Removes a product from the authenticated user's wishlist.
   * Uses a hard delete (the wishlist record is permanently removed from the database).
   * Looks up the record by userId + productId, then deletes it.
   *
   * @param req       - Express request object; `req.user.id` provides the authenticated user ID.
   * @param productId - The product ID to remove from the wishlist (passed as query parameter).
   * @returns Object with `status`, `message`, and empty `data` array.
   */
  @UseGuards(AuthGuard)
  @Delete('/delete')
  deleteWishList(@Request() req, @Query('productId') productId: number) {
    return this.wishlistService.deleteWishList(productId, req);
  }

  /**
   * GET /wishlist/wishlistCount
   *
   * Returns the total count of active wishlist items for the authenticated user.
   *
   * @param req - Express request object; `req.user.id` provides the authenticated user ID.
   * @returns Object with `status`, `message`, and `data` (number of active items).
   */
  @UseGuards(AuthGuard)
  @Get('/wishlistCount')
  wishlistCount(@Request() req) {
    return this.wishlistService.wishlistCount(req);
  }

}
