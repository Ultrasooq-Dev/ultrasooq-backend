/**
 * @module WishlistModule
 *
 * NestJS module for managing user product wishlists (save-for-later functionality).
 *
 * Routes provided by {@link WishlistController}:
 *  - POST   /wishlist/create              - Add a product to the user's wishlist
 *  - GET    /wishlist/getAllWishListByUser - Paginated listing of wishlist items
 *  - DELETE /wishlist/delete              - Remove a product from the wishlist (hard delete)
 *  - GET    /wishlist/wishlistCount       - Total active wishlist item count
 *
 * All endpoints require authentication via {@link AuthGuard}.
 *
 * Re-provides several shared services (UserService, AuthService, JwtService,
 * NotificationService, S3service, HelperService) so that AuthGuard and other
 * injected dependencies resolve correctly within this module's scope.
 */
import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  controllers: [WishlistController],
  providers: [WishlistService, UserService, AuthService, JwtService, NotificationService, S3service, HelperService]
})
export class WishlistModule {}
