/**
 * @file product.service.ts
 * @description Core business-logic service for the Product domain of the Ultrasooq
 *   B2B/B2C marketplace.  Encapsulates all database operations related to products,
 *   product pricing, reviews, Q&A, RFQ (Request For Quotation), factories/custom
 *   products, buy-group products, seller rewards, generated/shared links,
 *   existing-product copy workflows, country/location reference data, and analytics
 *   (view counts, most-sold products).
 *
 * @module ProductService
 *
 * @idea Centralise every product-related write and read operation behind a single
 *   injectable service so the controller layer remains a thin HTTP adapter.
 *
 * @usage Injected into {@link ProductController} by NestJS DI.
 *   All public methods return the standard envelope `{ status, message, data?, ... }`.
 *
 * @dataflow
 *   Controller -> ProductService method -> PrismaClient (module-scoped singleton)
 *   -> PostgreSQL database -> envelope response back to controller
 *
 *   Cross-cutting concerns:
 *   - HelperService.getAdminId()  resolves team-member -> admin ownership
 *   - NotificationService         dispatches in-app notifications (RFQ quotes, etc.)
 *   - S3service                   handles file uploads (seller images, barcodes)
 *   - bwip-js                     generates Code128 barcodes as base64 data-URLs
 *
 * @dependencies
 *   - {@link AuthService}           -- JWT helpers (not directly called in most methods)
 *   - {@link NotificationService}   -- in-app notification dispatch
 *   - {@link S3service}             -- AWS S3 file upload / retrieval
 *   - {@link HelperService}         -- admin-id / team-member ownership resolution
 *   - PrismaClient                  -- database access (module-scoped, NOT DI-managed)
 *   - bwip-js                       -- barcode image generation (Code128)
 *
 * @notes
 *   - PrismaClient is instantiated at module scope (`const prisma = new PrismaClient()`)
 *     rather than injected through NestJS DI.  This means all service instances share
 *     a single database connection pool.
 *   - Soft-delete pattern: `status = 'DELETE'` + `deletedAt = new Date()`.
 *   - All methods follow a try/catch pattern returning `{ status: false, message, error }`
 *     on failure.
 *   - Many methods accept `any`-typed payloads; validation is partially handled by DTOs
 *     at the controller layer and partially by inline checks.
 */
import { Injectable } from '@nestjs/common';

import { AuthService } from 'src/auth/auth.service';

import { NotificationService } from 'src/notification/notification.service';

import { S3service } from 'src/user/s3.service';

import { Prisma, Product } from '@prisma/client';

import * as bwipjs from 'bwip-js';

import {
  notifyAdminsNewProduct,
  notifyAdminsDropshipableProduct,
} from 'src/notification/notification.helper';

import { UpdatedProductPriceDto } from './dto/update-productPrice.dto';

import { AddMultiplePriceForProductDTO } from './dto/addMultiple-productPrice.dto';

import { UpdateMultiplePriceForProductDTO } from './dto/updateMultiple-productPrice.dto';

import { HelperService } from 'src/helper/helper.service';
import { OpenRouterService } from './openrouter.service';
import { MulterFile } from './types';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService, CACHE_KEYS, CACHE_TTL } from '../cache/cache.service';
import { ProductSearchService } from './product-search.service';
import { ProductPricingService } from './product-pricing.service';
import { ProductMediaService } from './product-media.service';
import { ProductRfqService } from './product-rfq.service';
import { ProductBuyGroupService } from './product-buygroup.service';
import { ProductFactoryService } from './product-factory.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * Module-scoped PrismaClient instance shared across all ProductService instances.
 * Not managed by NestJS dependency injection.
 * @type {PrismaClient}
 */

/**
 * @class ProductService
 * @description Injectable NestJS service containing all product-domain business logic.
 *
 * @intent Encapsulate database interactions and business rules so that the controller
 *   remains a thin pass-through and the service can be unit-tested in isolation.
 *
 * @usage Injected via constructor into {@link ProductController}.
 *
 * @dataflow See file-level JSDoc above.
 *
 * @dependencies
 *   - {@link AuthService}         -- authentication utilities
 *   - {@link NotificationService} -- notification dispatch
 *   - {@link S3service}           -- S3 file operations
 *   - {@link HelperService}       -- admin ownership resolution
 *
 * @notes
 *   - Every public method returns `Promise<{ status: boolean; message: string; data?: any; ... }>`.
 *   - Errors are caught and returned as `{ status: false, message, error }` -- exceptions
 *     are NOT propagated to NestJS exception filters.
 */
@Injectable()
export class ProductService {
  constructor(
    private readonly authService: AuthService,

    private readonly notificationService: NotificationService,

    private readonly s3service: S3service,

    private readonly helperService: HelperService,

    private readonly openRouterService: OpenRouterService,

    private readonly prisma: PrismaService,

    private readonly cacheService: CacheService,

    private readonly productSearchService: ProductSearchService,

    private readonly productPricingService: ProductPricingService,

    private readonly productMediaService: ProductMediaService,

    private readonly productRfqService: ProductRfqService,

    private readonly productBuyGroupService: ProductBuyGroupService,

    private readonly productFactoryService: ProductFactoryService,
  ) {}

  /**
   * @method create
   * @description Creates a new product with all associated child records: tags, images,
   *   price entries (with barcode generation), short descriptions, specifications,
   *   product variants, and geo sell regions (country/state/city).
   *
   * @intent Allow sellers to add a fully-formed product to the catalogue in one atomic operation.
   *
   * @usage Called by `ProductController.create()` via `POST /product/create`.
   *
   * @dataflow
   *   1. Validate SKU uniqueness
   *   2. Resolve admin ID via HelperService.getAdminId()
   *   3. Insert product record
   *   4. Insert child records: tags, images, price entries, variants, geo regions,
   *      short descriptions, specifications
   *   5. Generate barcodes (product-level + per price entry)
   *   6. Return { status, message, data }
   *
   * @dependencies HelperService, PrismaClient, bwip-js (barcode generation)
   *
   * @notes
   *   - SKU uniqueness is checked at the application level, not via a unique DB constraint.
   *   - menuId assignment: 8=Store, 9=BuyGroup, 10=Factories (based on sellType/isCustomProduct).
   *   - Barcode generation failure is caught silently (product is still created).
   *
   * @param {any} payload - Product creation data (see CreateProductDto for shape).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async create(payload: any, req: any) {
    try {
      if (payload?.skuNo) {
        let existProduct = await this.prisma.product.findFirst({
          where: { skuNo: payload?.skuNo },
        });


        if (existProduct) {
          return {
            status: false,

            message: 'This SKU No. Already Exist',

            data: [],
          };
        }
      }

      let userId = req?.user?.id;


      // Use payload userId/adminId if provided, otherwise use authenticated user's adminId
      let finalUserId: number;
      let finalAdminId: number;

      if (payload?.userId && payload?.adminId) {
        // Use the provided userId and adminId (for bulk add from scraper)
        finalUserId = payload.userId;
        finalAdminId = payload.adminId;
      } else {
        // Use authenticated user's adminId (default behavior)
        const adminIdFromToken = await this.helperService.getAdminId(userId);
        finalUserId = adminIdFromToken;
        finalAdminId = payload?.adminId || adminIdFromToken;
      }

      let addProduct = await this.prisma.product.create({
        data: {
          productName: payload?.productName,

          productType: payload?.productType ? payload?.productType : 'P',

          // Set isDropshipable based on productType
          isDropshipable:
            payload?.productType === 'D'
              ? true
              : payload?.isDropshipable || false,

          categoryId: payload?.categoryId,

          typeOfProduct: payload?.typeOfProduct
            ? payload?.typeOfProduct
            : 'BRAND',

          brandId: payload?.brandId,

          placeOfOriginId: payload?.placeOfOriginId,

          skuNo: payload?.skuNo,

          productPrice: payload?.productPrice ? payload?.productPrice : 0,

          offerPrice: payload?.offerPrice ? payload?.offerPrice : 0,

          shortDescription: payload?.shortDescription,

          description: payload?.description,

          specification: payload?.specification,

          categoryLocation: payload?.categoryLocation,

          userId: finalUserId,

          status: payload?.status || 'INACTIVE',

          adminId: finalAdminId,

          scrapMarkup: payload?.scrapMarkup
            ? Number(payload.scrapMarkup)
            : null,
        },
      });

      if (payload.productTagList && payload.productTagList.length > 0) {

        for (let i = 0; i < payload.productTagList.length; i++) {

          let addProductTags = await this.prisma.productTags.create({
            data: {
              productId: addProduct.id,

              tagId: payload.productTagList[i].tagId,
            },
          });
        }
      }

      // ── Multi-Category Support (Phase 1) ──
      // Create ProductCategoryMap entries for multi-category assignment
      if (payload.categoryIds && payload.categoryIds.length > 0) {
        const primaryCatId = payload.primaryCategoryId || payload.categoryIds[0];
        for (let c = 0; c < payload.categoryIds.length; c++) {
          await this.prisma.productCategoryMap.create({
            data: {
              productId: addProduct.id,
              categoryId: payload.categoryIds[c],
              isPrimary: payload.categoryIds[c] === primaryCatId,
              source: 'manual',
            },
          });
        }
      } else if (payload?.categoryId) {
        // Backward compatibility: single categoryId creates one mapping
        await this.prisma.productCategoryMap.create({
          data: {
            productId: addProduct.id,
            categoryId: payload.categoryId,
            isPrimary: true,
            source: 'manual',
          },
        });
      }

      // ── Spec Values Support (Phase 1) ──
      // Create ProductSpecValue entries from submitted spec data
      if (payload.specValues && payload.specValues.length > 0) {
        for (let sv = 0; sv < payload.specValues.length; sv++) {
          const specVal = payload.specValues[sv];
          await this.prisma.productSpecValue.create({
            data: {
              productId: addProduct.id,
              specTemplateId: specVal.specTemplateId,
              value: specVal.value,
              numericValue: specVal.numericValue !== undefined ? specVal.numericValue : null,
            },
          });
        }
      }

      if (payload.productImagesList && payload.productImagesList.length > 0) {

        for (let j = 0; j < payload.productImagesList.length; j++) {
          let addProductImages = await this.prisma.productImages.create({
            data: {
              productId: addProduct.id,

              imageName: payload?.productImagesList[j]?.imageName,

              image: payload?.productImagesList[j]?.image,

              videoName: payload?.productImagesList[j]?.videoName,

              video: payload?.productImagesList[j]?.video,

              variant: payload?.productImagesList[j]?.variant,
            },
          });
        }
      }

      if (payload?.productPriceList && payload?.productPriceList.length > 0) {
        for (let k = 0; k < payload.productPriceList.length; k++) {
          let menuId = 8; // Store

          if (payload?.productPriceList[k]?.isCustomProduct === 'true') {
            menuId = 10; // Factories
          } else if (
            payload?.productPriceList[k].sellType === 'BUYGROUP' &&
            payload?.productPriceList[k]?.isCustomProduct === 'false'
          ) {
            menuId = 9; // BuyGroup
          } else if (
            (payload?.productPriceList[k].sellType === 'TRIAL_PRODUCT' ||
              payload?.productPriceList[k].sellType === 'WHOLESALE_PRODUCT') &&
            payload?.productPriceList[k]?.isCustomProduct === 'false'
          ) {
            menuId = 8; // Store (for Trial and Wholesale products)
          }

          const dateOpen = payload?.productPriceList[k]?.dateOpen
            ? new Date(payload.productPriceList[k].dateOpen)
            : null;
          const dateClose = payload?.productPriceList[k]?.dateClose
            ? new Date(payload.productPriceList[k].dateClose)
            : null;
          const startTime =
            payload?.productPriceList[k]?.startTime || undefined;
          const endTime = payload?.productPriceList[k]?.endTime || undefined;
          const sellType =
            payload?.productPriceList[k].sellType || 'NORMALSELL';

          let addProductPrice = await this.prisma.productPrice.create({
            data: {
              productId: addProduct.id,

              adminId: finalAdminId,

              status: payload.productPriceList[k].status || 'ACTIVE',

              productPrice: payload.productPriceList[k].productPrice || 0,

              offerPrice: payload.productPriceList[k].offerPrice || 0,

              stock: payload?.productPriceList[k].stock || undefined,

              deliveryAfter:
                payload?.productPriceList[k].deliveryAfter || undefined,

              timeOpen: startTime,

              timeClose: endTime,

              consumerType:
                payload?.productPriceList[k].consumerType || undefined,

              sellType: sellType,

              vendorDiscount:
                payload?.productPriceList[k].vendorDiscount || undefined,

              consumerDiscount:
                payload?.productPriceList[k].consumerDiscount || undefined,

              minQuantity:
                payload?.productPriceList[k].minQuantity || undefined,

              maxQuantity:
                payload?.productPriceList[k].maxQuantity || undefined,

              productCondition:
                payload?.productPriceList[k].productCondition || undefined,

              minCustomer:
                payload?.productPriceList[k].minCustomer || undefined,

              maxCustomer:
                payload?.productPriceList[k].maxCustomer || undefined,

              minQuantityPerCustomer:
                payload?.productPriceList[k].minQuantityPerCustomer ||
                undefined,

              maxQuantityPerCustomer:
                payload?.productPriceList[k].maxQuantityPerCustomer ||
                undefined,

              askForStock: payload?.productPriceList[k]?.askForStock || 'false',

              askForPrice: payload?.productPriceList[k]?.askForPrice || 'false',

              vendorDiscountType:
                payload?.productPriceList[k]?.vendorDiscountType || undefined,

              consumerDiscountType:
                payload?.productPriceList[k]?.consumerDiscountType || undefined,

              dateOpen: dateOpen,

              dateClose: dateClose,

              startTime: startTime,

              endTime: endTime,

              isCustomProduct:
                payload?.productPriceList[k]?.isCustomProduct || 'false',

              productCountryId:
                payload?.productPriceList[k]?.productCountryId || undefined,

              productStateId:
                payload?.productPriceList[k]?.productStateId || undefined,

              productCityId:
                payload?.productPriceList[k]?.productCityId || undefined,

              productTown:
                payload?.productPriceList[k]?.productTown || undefined,

              productLatLng:
                payload?.productPriceList[k]?.productLatLng || undefined,

              menuId: payload?.productPriceList[k]?.menuId || menuId,
            },
          });

          // Send buygroup sale notification if it's a buygroup sale with future dates
          if (
            sellType === 'BUYGROUP' &&
            dateOpen &&
            dateClose &&
            startTime &&
            endTime
          ) {
            try {
              const startDate = new Date(dateOpen);
              const [startHours, startMinutes] = (startTime || '00:00')
                .split(':')
                .map(Number);
              startDate.setHours(startHours || 0, startMinutes || 0, 0, 0);
              const startTimestamp = startDate.getTime();
              const now = Date.now();

              // Only notify if sale is in the future
              if (startTimestamp > now) {
                // Get users to notify about new buygroup sale
                // 1. Users who have the product in wishlist
                const wishlistUsers = await this.prisma.wishlist.findMany({
                  where: {
                    productId: addProduct.id,
                    status: 'ACTIVE',
                  },
                  select: { userId: true },
                  distinct: ['userId'],
                });

                // 2. Get all active buyers (users with tradeRole BUYER)
                // This ensures notifications reach potential buyers even if they don't have product in wishlist yet
                const allBuyers = await this.prisma.user.findMany({
                  where: {
                    status: 'ACTIVE',
                    userType: 'USER',
                    tradeRole: 'BUYER', // BUYER is the main buyer role in TypeTrader enum
                  },
                  select: { id: true },
                  take: 5000, // Safety cap for bulk notifications
                });

                // Combine wishlist users and all buyers, remove duplicates
                const wishlistUserIds = new Set(
                  wishlistUsers.map((u) => u.userId).filter((id) => id),
                );
                const buyerIds = allBuyers.map((u) => u.id);
                const allUserIds = [
                  ...new Set([...Array.from(wishlistUserIds), ...buyerIds]),
                ];

                const timeRemaining = startTimestamp - now;
                const daysRemaining = Math.floor(
                  timeRemaining / (24 * 60 * 60 * 1000),
                );
                const formattedDate = new Date(dateOpen).toLocaleDateString(
                  'en-US',
                  {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  },
                );

                // Notify all users about the new buygroup sale
                for (const userId of allUserIds) {
                  if (userId) {
                    try {
                      await this.notificationService.createNotification({
                        userId,
                        type: 'BUYGROUP',
                        title: 'New Buygroup Sale Scheduled!',
                        message: `A buygroup sale for ${payload?.productName || 'a product'} is starting on ${formattedDate}. Don't miss out!`,
                        data: {
                          productId: addProduct.id,
                          productPriceId: addProductPrice.id,
                          productName: payload?.productName,
                          saleType: 'scheduled',
                          startDate: dateOpen.toISOString(),
                          startTime: startTime,
                          timeRemaining,
                        },
                        link: `/trending/${addProduct.id}`,
                        icon: '🎉',
                      });
                    } catch (notifError) {
                    }
                  }
                }
              }
            } catch (notificationError) {
            }
          }

          // Product Variant

          if (payload.productVariant) {
            let newProductVariant = await this.prisma.productVariant.create({
              data: {
                productId: addProduct.id,

                productPriceId: addProductPrice.id,

                object: payload.productVariant,
              },
            });
          }

          // Store sellCountryIds

          if (payload.productPriceList[k]?.sellCountryIds) {
            for (let country of payload.productPriceList[k].sellCountryIds ||
              []) {
              await this.prisma.productSellCountry.create({
                data: {
                  productId: addProduct.id,

                  productPriceId: addProductPrice.id,

                  countryName: country.label,

                  countryId: country.value,

                  status: 'ACTIVE',
                },
              });
            }
          }

          // Store sellStateIds

          if (payload.productPriceList[k]?.sellStateIds) {
            for (let state of payload.productPriceList[k].sellStateIds || []) {
              await this.prisma.productSellState.create({
                data: {
                  productId: addProduct.id,

                  productPriceId: addProductPrice.id,

                  stateName: state.label,

                  stateId: state.value,

                  status: 'ACTIVE',
                },
              });
            }
          }

          // Store sellCityIds

          if (payload.productPriceList[k]?.sellCityIds) {
            for (let city of payload.productPriceList[k].sellCityIds || []) {
              await this.prisma.productSellCity.create({
                data: {
                  productId: addProduct.id,

                  productPriceId: addProductPrice.id,

                  cityName: city.label,

                  cityId: city.value,

                  status: 'ACTIVE',
                },
              });
            }
          }

          try {
            const barcodeImageProductPrice =
              await this.generateBarcodeForProductPrice(
                addProductPrice.id.toString(),

                addProduct.id.toString(),

                finalAdminId.toString(),
              );

            await this.prisma.productPrice.update({
              where: { id: addProductPrice.id },

              data: { productPriceBarcode: barcodeImageProductPrice },
            });
          } catch (error) {
          }
        }
      }

      if (
        payload?.productShortDescriptionList &&
        payload?.productShortDescriptionList.length > 0
      ) {
        for (let s = 0; s < payload.productShortDescriptionList.length; s++) {
          let addProductImages = await this.prisma.productShortDescription.create({
            data: {
              productId: addProduct.id,

              adminId: finalAdminId,

              shortDescription:
                payload?.productShortDescriptionList[s]?.shortDescription,
            },
          });
        }
      }

      if (
        payload?.productSpecificationList &&
        payload?.productSpecificationList.length > 0
      ) {
        for (let i = 0; i < payload.productSpecificationList.length; i++) {
          let addProductSpecifications =
            await this.prisma.productSpecification.create({
              data: {
                productId: addProduct.id,

                adminId: finalAdminId,

                label: payload?.productSpecificationList[i]?.label,

                specification:
                  payload?.productSpecificationList[i]?.specification,
              },
            });
        }
      }

      // Generate the barcode for the product

      const barcodeImage = await this.generateBarcode(
        addProduct.id.toString(),

        addProduct.productName,

        addProduct?.skuNo || '',
      );

      // Save the barcode image URL or data to the product in the database

      await this.prisma.product.update({
        where: { id: addProduct.id },

        data: { barcode: barcodeImage }, // Assuming you have a 'barcode' field in your Product model
      });

      // Notify admins about new product
      try {
        await notifyAdminsNewProduct(
          this.notificationService,
          addProduct.id,
          addProduct.productName,
          finalUserId,
          this.prisma,
        );
      } catch (notifError) {
      }

      // Notify admins if it's a dropshipable product
      if (addProduct.isDropshipable || payload?.productType === 'D') {
        try {
          await notifyAdminsDropshipableProduct(
            this.notificationService,
            addProduct.id,
            addProduct.productName,
            finalUserId,
            this.prisma,
          );
        } catch (notifError) {
        }
      }

      // Invalidate product listing caches so new product appears in search results
      await this.cacheService.invalidateProductListings();

      return {
        status: true,

        message: 'Created Successfully',

        data: addProduct,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in create product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method generateBarcode
   * @description Generates a Code128 barcode image for a product, encoding the
   *   product ID, name, and SKU into the barcode data string.
   *
   * @intent Produce a scannable barcode for physical product labelling and inventory management.
   *
   * @usage Called internally by `create()` and `update()` after product record persistence.
   *
   * @dataflow productId + productName + sku -> bwip-js Code128 -> PNG buffer
   *   -> base64 data URL string
   *
   * @dependencies bwip-js library
   *
   * @notes
   *   - Returns a `data:image/png;base64,...` data URL stored directly in the DB.
   *   - Barcode text format: `{productId}-{productName}-{sku}`.
   *
   * @param {string} productId - Product primary key as string.
   * @param {string} productName - Product display name.
   * @param {string} sku - Stock Keeping Unit number.
   * @returns {Promise<string>} Base64 data URL of the barcode PNG image.
   */
  async generateBarcode(
    productId: string,

    productName: string,

    sku: string,
  ): Promise<string> {
    // Concatenate the product ID, product name, and SKU into a single string

    const barcodeData = `${productId}-${productName}-${sku}`;

    // Generate the barcode using bwip-js

    const barcodeOptions = {
      bcid: 'code128', // Barcode type

      text: barcodeData, // Data to encode

      scale: 3, // Scaling factor

      height: 10, // Bar height, in millimeters

      includetext: true, // Include human-readable text below the barcode

      // includetext: false, // Exclude human-readable text below the barcode
    };

    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(barcodeOptions, (err, png) => {
        if (err) {
          reject(err);
        } else {
          // Convert the barcode image buffer to a data URL

          const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

          resolve(dataUrl);
        }
      });
    });
  }

  /**
   * @method generateBarcodeForProductPrice
   * @description Generates a Code128 barcode image for a product-price entry, encoding
   *   the product ID, price entry ID, and admin ID.
   *
   * @intent Produce a scannable barcode unique to a seller's price listing for
   *   inventory and POS tracking.
   *
   * @usage Called internally by `create()` and `addPriceForProduct()` after price record creation.
   *
   * @dataflow productId + productPriceId + adminId -> bwip-js Code128 -> PNG buffer
   *   -> base64 data URL string
   *
   * @dependencies bwip-js library
   *
   * @notes Barcode text format: `{productId}-{productPriceId}-{adminId}`.
   *
   * @param {string} productId - Product primary key as string.
   * @param {string} productPriceId - ProductPrice primary key as string.
   * @param {string} adminId - Admin/seller user ID as string.
   * @returns {Promise<string>} Base64 data URL of the barcode PNG image.
   */
  async generateBarcodeForProductPrice(
    productId: string,

    productPriceId: string,

    adminId: string,
  ) {
    const barcodeData = `${productId}-${productPriceId}-${adminId}`;

    const barcodeOptions = {
      bcid: 'code128', // Barcode type

      text: barcodeData, // Data to encode

      scale: 3, // Scaling factor

      height: 10, // Bar height, in millimeters

      includetext: true, // Include human-readable text below the barcode
    };

    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(barcodeOptions, (err, png) => {
        if (err) {
          reject(err);
        } else {
          // Convert the barcode image buffer to a data URL

          const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

          resolve(dataUrl);
        }
      });
    });
  }

  /**
   * @method update
   * @description Updates an existing product and all its child records (tags, images,
   *   short descriptions, specifications, price entries, variants, and geo sell regions).
   *   Regenerates the product barcode after update.
   *
   * @intent Allow sellers to modify a product they own, including full replacement of
   *   child record collections.
   *
   * @usage Called by `ProductController.update()` via `PATCH /product/update`.
   *
   * @dataflow
   *   1. Resolve admin ID via HelperService.getAdminId()
   *   2. Find existing product by payload.productId
   *   3. Merge payload over existing fields (fallback to current values)
   *   4. Delete-and-recreate: tags, images, short descriptions, specifications
   *   5. Update price entry (first matching adminId) with all pricing fields
   *   6. Delete-and-recreate geo sell regions per price entry
   *   7. Update product variant if provided
   *   8. Regenerate product barcode
   *   9. Return { status, message, data }
   *
   * @dependencies HelperService, PrismaClient, bwip-js
   *
   * @notes
   *   - Uses delete-and-recreate strategy for child collections (not upsert).
   *   - Only updates the FIRST productPrice matching the admin's ID.
   *   - menuId logic mirrors `create()`: 8=Store, 9=BuyGroup, 10=Factories.
   *
   * @param {any} payload - Product update data including `productId`.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async update(payload: any, req: any) {
    try {
      let userId = req?.user?.id;

      userId = await this.helperService.getAdminId(userId);


      const productId = payload.productId;

      let productDetail = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      let updatedProduct = await this.prisma.product.update({
        where: { id: productId },

        data: {
          productName: payload.productName || productDetail.productName,

          typeOfProduct: payload.typeOfProduct || productDetail.typeOfProduct,

          categoryId: payload.categoryId || productDetail.categoryId,

          brandId: payload.brandId || productDetail.brandId,

          placeOfOriginId:
            payload.placeOfOriginId || productDetail.placeOfOriginId,

          skuNo: payload.skuNo || productDetail.skuNo,

          productPrice: payload.productPrice || productDetail.productPrice,

          offerPrice: payload.offerPrice || productDetail.offerPrice,

          shortDescription:
            payload.shortDescription || productDetail.shortDescription,

          description: payload.description || productDetail.description,

          specification: payload.specification || productDetail.specification,

          categoryLocation:
            payload?.categoryLocation || productDetail.categoryLocation,

          productType: payload?.productType || productDetail.productType,

          // Set isDropshipable based on productType
          isDropshipable:
            payload?.productType === 'D'
              ? true
              : payload?.isDropshipable !== undefined
                ? payload.isDropshipable
                : productDetail.isDropshipable,

          adminId: payload?.adminId || userId,

          userId: payload?.userId || userId,
        },
      });

      if (payload.productTagList && payload.productTagList.length > 0) {
        await this.prisma.productTags.deleteMany({
          where: { productId: productId },
        });

        for (let i = 0; i < payload.productTagList.length; i++) {
          let addProductTags = await this.prisma.productTags.create({
            data: {
              productId: productId,

              tagId: payload.productTagList[i].tagId,
            },
          });
        }
      }

      if (payload.productImagesList && payload.productImagesList.length > 0) {
        await this.prisma.productImages.deleteMany({
          where: { productId: productId },
        });

        for (let j = 0; j < payload.productImagesList.length; j++) {
          let addProductImages = await this.prisma.productImages.create({
            data: {
              productId: productId,

              imageName: payload?.productImagesList[j]?.imageName,

              image: payload?.productImagesList[j]?.image,

              videoName: payload?.productImagesList[j]?.videoName,

              video: payload?.productImagesList[j]?.video,

              variant: payload?.productImagesList[j]?.variant,
            },
          });
        }
      }

      if (
        payload?.productShortDescriptionList &&
        payload?.productShortDescriptionList.length > 0
      ) {
        await this.prisma.productShortDescription.deleteMany({
          where: { productId: productId },
        });

        for (let s = 0; s < payload.productShortDescriptionList.length; s++) {
          let addProductImages = await this.prisma.productShortDescription.create({
            data: {
              productId: productId,

              adminId: userId,

              shortDescription:
                payload?.productShortDescriptionList[s]?.shortDescription,
            },
          });
        }
      }

      if (
        payload?.productSpecificationList &&
        payload?.productSpecificationList.length > 0
      ) {
        await this.prisma.productSpecification.deleteMany({
          where: { productId: productId },
        });

        for (let i = 0; i < payload.productSpecificationList.length; i++) {
          let addProductSpecifications =
            await this.prisma.productSpecification.create({
              data: {
                productId: productId,

                adminId: userId,

                label: payload?.productSpecificationList[i]?.label,

                specification:
                  payload?.productSpecificationList[i]?.specification,
              },
            });
        }
      }

      if (payload?.productPriceList && payload?.productPriceList.length > 0) {
        let productPriceDetail = await this.prisma.productPrice.findFirst({
          where: {
            productId: productId,

            adminId: userId,
          },
        });

        for (let k = 0; k < payload.productPriceList.length; k++) {
          let menuId = 8; // Store

          if (payload?.productPriceList[k]?.isCustomProduct === 'true') {
            menuId = 10; // Factories
          } else if (
            payload?.productPriceList[k].sellType === 'BUYGROUP' &&
            payload?.productPriceList[k]?.isCustomProduct === 'false'
          ) {
            menuId = 9; // BuyGroup
          } else if (
            (payload?.productPriceList[k].sellType === 'TRIAL_PRODUCT' ||
              payload?.productPriceList[k].sellType === 'WHOLESALE_PRODUCT') &&
            payload?.productPriceList[k]?.isCustomProduct === 'false'
          ) {
            menuId = 8; // Store (for Trial and Wholesale products)
          }

          let addProductPrice = await this.prisma.productPrice.update({
            where: { id: productPriceDetail?.id },

            data: {
              status:
                payload.productPriceList[k].status || productPriceDetail.status,

              productPrice:
                payload?.productPriceList[k]?.productPrice ||
                productPriceDetail.productPrice,

              offerPrice:
                payload?.productPriceList[k]?.offerPrice ||
                productPriceDetail.offerPrice,

              stock:
                payload?.productPriceList[k]?.stock || productPriceDetail.stock,

              deliveryAfter:
                payload?.productPriceList[k]?.deliveryAfter ||
                productPriceDetail.deliveryAfter,

              timeOpen:
                payload?.productPriceList[k]?.timeOpen ||
                productPriceDetail.timeOpen,

              timeClose:
                payload?.productPriceList[k]?.timeClose ||
                productPriceDetail.timeClose,

              consumerType:
                payload?.productPriceList[k]?.consumerType ||
                productPriceDetail.consumerType,

              sellType:
                payload?.productPriceList[k]?.sellType ||
                productPriceDetail.sellType,

              vendorDiscount:
                payload?.productPriceList[k]?.vendorDiscount ||
                productPriceDetail.vendorDiscount,

              consumerDiscount:
                payload?.productPriceList[k]?.consumerDiscount ||
                productPriceDetail.consumerDiscount,

              minQuantity:
                payload?.productPriceList[k]?.minQuantity ||
                productPriceDetail.minQuantity,

              maxQuantity:
                payload?.productPriceList[k]?.maxQuantity ||
                productPriceDetail.maxQuantity,

              productCondition:
                payload?.productPriceList[k].productCondition ||
                productPriceDetail.productCondition,

              minCustomer:
                payload?.productPriceList[k].minCustomer ||
                productPriceDetail.minCustomer,

              maxCustomer:
                payload?.productPriceList[k].maxCustomer ||
                productPriceDetail.maxCustomer,

              minQuantityPerCustomer:
                payload?.productPriceList[k].minQuantityPerCustomer ||
                productPriceDetail.minQuantityPerCustomer,

              maxQuantityPerCustomer:
                payload?.productPriceList[k].maxQuantityPerCustomer ||
                productPriceDetail.maxQuantityPerCustomer,

              vendorDiscountType:
                payload?.productPriceList[k]?.vendorDiscountType ||
                productPriceDetail.vendorDiscountType,

              consumerDiscountType:
                payload?.productPriceList[k]?.consumerDiscountType ||
                productPriceDetail.consumerDiscountType,

              dateOpen: payload?.productPriceList[k]?.dateOpen
                ? new Date(payload.productPriceList[k].dateOpen)
                : productPriceDetail.consumerDiscountType,

              dateClose: payload?.productPriceList[k]?.dateClose
                ? new Date(payload.productPriceList[k].dateClose)
                : productPriceDetail.consumerDiscountType,

              startTime:
                payload?.productPriceList[k]?.startTime ||
                productPriceDetail.startTime,

              endTime:
                payload?.productPriceList[k]?.endTime ||
                productPriceDetail.endTime,

              isCustomProduct:
                payload?.productPriceList[k]?.isCustomProduct ||
                productPriceDetail.isCustomProduct,

              productCountryId:
                payload?.productPriceList[k]?.productCountryId ||
                productPriceDetail.productCountryId,

              productStateId:
                payload?.productPriceList[k]?.productStateId ||
                productPriceDetail.productStateId,

              productCityId:
                payload?.productPriceList[k]?.productCityId ||
                productPriceDetail.productCityId,

              productTown:
                payload?.productPriceList[k]?.productTown ||
                productPriceDetail.productTown,

              productLatLng:
                payload?.productPriceList[k]?.productLatLng ||
                productPriceDetail.productLatLng,

              menuId:
                payload?.productPriceList[k]?.menuId ||
                productPriceDetail.menuId,
            },
          });

          // Store sellCountryIds

          if (payload.productPriceList[k]?.sellCountryIds) {
            await this.prisma.productSellCountry.deleteMany({
              where: { productId: productId },
            });

            for (let country of payload.productPriceList[k].sellCountryIds ||
              []) {
              await this.prisma.productSellCountry.create({
                data: {
                  productId: productId,

                  productPriceId: addProductPrice.id,

                  countryName: country.label,

                  countryId: country.value,

                  status: 'ACTIVE',
                },
              });
            }
          }

          // Store sellStateIds

          if (payload.productPriceList[k]?.sellStateIds) {
            await this.prisma.productSellState.deleteMany({
              where: { productId: productId },
            });

            for (let state of payload.productPriceList[k].sellStateIds || []) {
              await this.prisma.productSellState.create({
                data: {
                  productId: productId,

                  productPriceId: addProductPrice.id,

                  stateName: state.label,

                  stateId: state.value,

                  status: 'ACTIVE',
                },
              });
            }
          }

          // Store sellCityIds

          if (payload.productPriceList[k]?.sellCityIds) {
            await this.prisma.productSellCity.deleteMany({
              where: { productId: productId },
            });

            for (let city of payload.productPriceList[k].sellCityIds || []) {
              await this.prisma.productSellCity.create({
                data: {
                  productId: productId,

                  productPriceId: addProductPrice.id,

                  cityName: city.label,

                  cityId: city.value,

                  status: 'ACTIVE',
                },
              });
            }
          }
        }

        if (payload?.productVariant) {
          let updateProductVariant = await this.prisma.productVariant.updateMany({
            where: {
              productPriceId: productPriceDetail.id,
            },

            data: {
              object: payload?.productVariant,
            },
          });
        }
      }

      // Generate the barcode for the product

      const barcodeImage = await this.generateBarcode(
        productDetail.id.toString(),

        productDetail.productName,

        productDetail?.skuNo || '',
      );

      // Save the barcode image URL or data to the product in the database

      await this.prisma.product.update({
        where: { id: productDetail.id },

        data: { barcode: barcodeImage }, // Assuming you have a 'barcode' field in your Product model
      });

      // Invalidate product detail cache and listing caches
      await this.cacheService.invalidateProduct(productDetail.id);
      await this.cacheService.invalidateProductListings();

      return {
        status: true,

        message: 'Fetch SuccessFully',

        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in update product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getProductVariant
   * @description Retrieves product variant records for one or more product-price IDs.
   *
   * @intent Fetch variant configuration (e.g. size/colour combinations) for display
   *   on the product detail page or cart.
   *
   * @usage Called by `ProductController.getProductVariant()` via `POST /product/getProductVariant`.
   *
   * @dataflow payload.productPriceId (number[]) -> Prisma productVariant.findMany({ where: { in } })
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Accepts an array of productPriceIds via the `productPriceId` body field.
   *
   * @param {any} payload - Body containing `productPriceId` (number or number[]).
   * @param {any} req - Express request object (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getProductVariant(payload: any, req: any) {
    try {
      const productPriceIds = payload?.productPriceId;

      let productVariant = await this.prisma.productVariant.findMany({
        where: {
          productPriceId: { in: productPriceIds },
        },
      });

      if (!productVariant) {
        return {
          status: false,

          message: 'product variant not found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productVariant,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in update product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method findOneProductPrice
   * @description Retrieves a single product-price record by product ID and user ID.
   *
   * @intent Look up a specific seller's price entry for a given product.
   *
   * @usage Called by `ProductController.findOneProductPrice()` via `GET /product/findOneProductPrice`.
   *
   * @dataflow payload.productId + payload.userId -> Prisma productPrice.findFirst()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Body containing `productId` and `userId`.
   * @param {any} req - Express request object (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async findOneProductPrice(payload: any, req: any) {
    try {
      const userId = payload.userId;

      const productId = payload.productId;

      let productPrice = await this.prisma.productPrice.findFirst({
        where: {
          productId: productId,

          adminId: userId,
        },
      });

      return {
        status: true,

        message: 'Fetch SuccessFully',

        data: productPrice,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in update product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method findAll
   * @description Retrieves a paginated list of products owned by a specific user,
   *   with search, brand, status, expiry, discount, and sell-type filtering.
   *
   * @intent Power the seller's product catalogue dashboard with rich filtering.
   *
   * @usage Called by `ProductController.findAll()` via `GET /product/findAll`.
   *
   * @dataflow
   *   1. Resolve admin ID via HelperService.getAdminId()
   *   2. Build dynamic where condition from params + req.query (status, expireDate, discount, sellType)
   *   3. Prisma product.findMany() with includes (category, brand, tags, images, reviews, wishlist, prices)
   *   4. Prisma product.count() for total
   *   5. Return { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - Search term must be >= 3 characters to activate.
   *   - `req.query.status` can override the default `{ not: 'DELETE' }` filter.
   *   - Products are filtered by `productType: 'P'` (physical products only).
   *
   * @param {any} userId - Owner user ID.
   * @param {any} page - Page number (1-based, defaults to 1).
   * @param {any} limit - Items per page (defaults to 10).
   * @param {any} req - Express request with additional query params.
   * @param {any} term - Search term for product name.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  // done where userId

  async findAll(
    userId: any,

    page: any,

    limit: any,

    req: any,

    term: any,

    brandIds: any,
  ) {
    try {
      let userID = parseInt(userId);

      let admin_id = userID;

      admin_id = await this.helperService.getAdminId(admin_id);


      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      let today = new Date();

      let statusFilter = req.query.status
        ? req.query.status
        : { not: 'DELETE' };

      const sellTypes = req.query.sellType
        ? req.query.sellType.split(',').map((type) => type.trim())
        : null;

      let whereCondition: any = {
        productType: 'P',

        // status: { in: ['ACTIVE', 'INACTIVE'] },

        status: statusFilter,

        // adminId: userID,

        product_productPrice: {
          some: {
            adminId: userID,
          },
        },

        productName: {
          contains: searchTerm,

          mode: 'insensitive',
        },

        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
      };

      if (req.query.expireDate === 'expired') {
        whereCondition.product_productPrice.some = {
          ...whereCondition.product_productPrice.some,

          dateClose: { lt: today },
        };
      }

      if (req.query.discount === 'true') {
        whereCondition.product_productPrice.some = {
          ...whereCondition.product_productPrice.some,

          OR: [
            { vendorDiscount: { not: null } },

            { consumerDiscount: { not: null } },
          ],
        };
      }

      if (sellTypes?.length > 0) {
        whereCondition.product_productPrice.some = {
          ...whereCondition.product_productPrice.some,

          sellType: { in: sellTypes },
        };
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,

        include: {
          // userBy: { where: { status: 'ACTIVE' } },

          // adminBy: { where: { status: 'ACTIVE' } },

          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          placeOfOrigin: { where: { status: 'ACTIVE' } },

          productTags: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productTagsTag: true,
            },
          },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          // ── Multi-Category (Phase 1) ──
          productCategories: {
            where: { status: 'ACTIVE', deletedAt: null },
            include: {
              category: { select: { id: true, name: true } },
            },
          },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_wishlist: {
            where: { userId: userID },

            select: {
              userId: true,

              productId: true,
            },
          },

          product_productPrice: {
            where: {
              adminId: userID,
            },

            include: {
              adminDetail: { where: { status: 'ACTIVE' } },
            },
          },
        },

        orderBy: { createdAt: 'desc' },

        skip, // Offset

        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetailList,

        totalCount: productDetailListCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in findAll product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method findOne
   * @description Retrieves a single product by ID with full relational data, the
   *   lowest-price seller, other sellers, wishlist status, and optional shared-link details.
   *
   * @intent Power the product detail page (PDP) for storefront consumers and vendors.
   *
   * @usage Called by `ProductController.findOne()` via `GET /product/findOne`.
   *
   * @dataflow
   *   1. Prisma product.findUnique() with deep includes (category + dynamic forms,
   *      brand, tags, images, descriptions, specifications, reviews, prices, geo regions)
   *   2. productPrice ordered by offerPrice asc, take 1 (cheapest seller)
   *   3. Wishlist check if userId provided
   *   4. Other sellers query (excluding cheapest)
   *   5. Shared link lookup if req.query.sharedLinkId provided
   *   6. Return { status, message, data, totalCount, inWishlist, otherSeller, generatedLinkDetail }
   *
   * @dependencies PrismaClient
   *
   * @notes Returns `inWishlist: 0|1` flag for the frontend toggle.
   *
   * @param {any} productId - Product primary key.
   * @param {any} req - Express request (reads `req.query.sharedLinkId`).
   * @param {any} userId - Optional viewer user ID for wishlist detection.
   * @returns {Promise<{status: boolean, message: string, data?: any, otherSeller?: any[], error?: string}>}
   */
  async findOne(productId: any, req: any, userId: any) {
    try {
      let inWishlist = 0;

      let currentSeller;

      var otherSeller;

      const productID = parseInt(productId);

      // Return cached result for anonymous views (no userId, no sharedLinkId)
      const isAnonymous = !userId && !req?.query?.sharedLinkId;
      if (isAnonymous) {
        const cacheKey = CACHE_KEYS.PRODUCT_DETAIL(productID);
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;
      }

      // Note: Using 'include' without 'select' returns all fields from Product model
      // This includes: categoryId, categoryLocation (required for category-based discount logic)
      // ProductPrice includes: consumerType, consumerDiscount, vendorDiscount, etc.
      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },

        include: {
          category: {
            where: { status: 'ACTIVE' },

            include: {
              category_dynamicFormCategory: {
                include: {
                  formIdDetail: {
                    include: {
                      elements: true,
                    },
                  },
                },
              },
            },
          },

          brand: { where: { status: 'ACTIVE' } },

          placeOfOrigin: { where: { status: 'ACTIVE' } },

          productTags: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productTagsTag: true,
            },
          },

          productImages: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          product_productSpecification: { where: { status: 'ACTIVE' } },

          // ── Multi-Category & Spec Values (Phase 1) ──
          productCategories: {
            where: { status: 'ACTIVE', deletedAt: null },
            include: {
              category: { select: { id: true, name: true, parentId: true, icon: true } },
            },
            orderBy: { isPrimary: 'desc' },
          },
          productSpecValues: {
            where: { status: 'ACTIVE', deletedAt: null },
            include: {
              specTemplate: {
                select: { id: true, name: true, key: true, dataType: true, unit: true, groupName: true, isFilterable: true },
              },
            },
          },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          // Note: Using 'include' without 'select' returns all ProductPrice fields
          // This includes: consumerType, consumerDiscount, vendorDiscount, etc.
          // Required for category-based discount logic
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productPrice_productSellerImage: true,

              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },

          product_sellCountry: { where: { status: 'ACTIVE' } },

          product_sellState: { where: { status: 'ACTIVE' } },

          product_sellCity: { where: { status: 'ACTIVE' } },
        },
      });

      if (!productDetail) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,

          inWishlist: 0,

          otherSeller: [],
        };
      }

      if (userId) {
        const userID = parseInt(userId);

        let existInWishlist = await this.prisma.wishlist.findFirst({
          where: {
            userId: userID,

            productId: productID,
          },
        });

        if (existInWishlist) {
          inWishlist = 1;
        }
      }

      if (productDetail && productDetail.product_productPrice.length > 0) {
        currentSeller = productDetail?.product_productPrice;

        let currentSellerId = currentSeller[0].adminId;

        otherSeller = await this.prisma.productPrice.findMany({
          where: {
            productId: productID,

            adminId: {
              not: currentSellerId,
            },

            status: 'ACTIVE',
          },

          include: {
            adminDetail: {
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

                    companyName: true,
                  },
                },
              },
            },
          },
        });
      }

      let generatedLinkDetail;

      if (req.query.sharedLinkId) {
        const sharedLinkId = req.query.sharedLinkId;

        let sharedLinkExist = await this.prisma.sharedLink.findUnique({
          where: {
            id: parseInt(sharedLinkId),
          },
        });

        if (sharedLinkExist) {
          generatedLinkDetail = sharedLinkExist;
        }
      }

      const result = {
        status: true,

        message: 'Fetch Successfully',

        data: productDetail,

        totalCount: 1,

        inWishlist: inWishlist,

        otherSeller: otherSeller ? otherSeller : [],

        generatedLinkDetail: generatedLinkDetail,
      };

      // Cache anonymous product detail views for 5 minutes
      if (isAnonymous) {
        await this.cacheService.set(
          CACHE_KEYS.PRODUCT_DETAIL(productID),
          result,
          CACHE_TTL.PRODUCT_DETAIL,
        );
      }

      return result;
    } catch (error) {

      return {
        status: false,

        message: 'error in findOne product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method findOneWithProductPrice
   * @description Retrieves a single product filtered to a specific seller's (adminId)
   *   price entries, plus other sellers and wishlist status.
   *
   * @intent Power the product detail page when the caller knows which seller to view.
   *
   * @usage Called by `ProductController.findOneWithProductPrice()` via
   *   `GET /product/findOneWithProductPrice`.
   *
   * @dataflow
   *   1. Prisma product.findUnique() with productPrice filtered by adminId + ACTIVE
   *   2. Wishlist check if userId provided
   *   3. Other sellers query (excluding current admin)
   *   4. Return { status, message, data, totalCount, inWishlist, otherSeller }
   *
   * @dependencies PrismaClient
   *
   * @notes Unlike `findOne`, returns ALL active prices for the specified admin (no take: 1).
   *
   * @param {any} productId - Product primary key.
   * @param {any} adminId - Seller/admin user ID to scope price entries.
   * @param {any} req - Express request object.
   * @param {any} userId - Optional viewer user ID for wishlist detection.
   * @returns {Promise<{status: boolean, message: string, data?: any, otherSeller?: any[], error?: string}>}
   */
  async findOneWithProductPrice(
    productId: any,

    adminId: any,

    req: any,

    userId: any,
  ) {
    try {
      let inWishlist = 0;

      let currentSeller;

      var otherSeller;

      const productID = parseInt(productId);

      const adminID = parseInt(adminId);

      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },

        include: {
          category: {
            where: { status: 'ACTIVE' },

            include: {
              category_dynamicFormCategory: {
                include: {
                  formIdDetail: {
                    include: {
                      elements: true,
                    },
                  },
                },
              },
            },
          },

          brand: { where: { status: 'ACTIVE' } }, // Include the brand relation with active status

          placeOfOrigin: { where: { status: 'ACTIVE' } }, // Include the placeOfOrigin relation with active status

          productTags: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productTagsTag: true,
            },
          },

          productImages: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          product_productSpecification: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_productPrice: {
            where: {
              adminId: adminID,

              status: 'ACTIVE',
            },

            include: {
              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!productDetail) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,

          inWishlist: 0,

          otherSeller: [],
        };
      }

      if (userId) {
        // checking WishList

        const userID = parseInt(userId);

        let existInWishlist = await this.prisma.wishlist.findFirst({
          where: {
            userId: userID,

            productId: productID,
          },
        });

        if (existInWishlist) {
          inWishlist = 1;
        }
      }

      if (productDetail && productDetail.product_productPrice.length > 0) {
        // checking other Seller for same productId

        currentSeller = productDetail?.product_productPrice;

        let currentSellerId = currentSeller[0].adminId;

        otherSeller = await this.prisma.productPrice.findMany({
          where: {
            productId: productID,

            adminId: {
              not: currentSellerId,
            },

            status: 'ACTIVE',
          },

          include: {
            adminDetail: {
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

                    companyName: true,
                  },
                },
              },
            },
          },
        });
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetail,

        totalCount: 1,

        inWishlist: inWishlist,

        otherSeller: otherSeller ? otherSeller : [],
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in findOneWithProductPrice',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method vendorDetails
   * @description Retrieves a vendor's public profile including user details,
   *   business types, branches, and branch tags.
   *
   * @intent Power the vendor public profile page on the storefront.
   *
   * @usage Called by `ProductController.vendorDetails()` via `GET /product/vendorDetails`.
   *
   * @dataflow adminId -> Prisma user.findUnique() with profile, businessType, branches
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} adminId - Vendor's user ID.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async vendorDetails(adminId: any) {
    try {
      let adminID = parseInt(adminId);

      if (!adminID) {
        return {
          status: false,

          message: 'adminId is required',

          data: [],

          totalCount: 0,
        };
      }

      let vendorDetails = await this.prisma.user.findUnique({
        where: { id: adminID },

        select: {
          id: true,

          uniqueId: true,

          accountName: true,

          cc: true,

          phoneNumber: true,

          email: true,

          firstName: true,

          lastName: true,

          profilePicture: true,

          tradeRole: true,

          masterAccount: {
            select: {
              id: true,
              email: true,
              phoneNumber: true,
              firstName: true,
              lastName: true,
              profilePicture: true,
            },
          },

          userProfile: {
            include: {
              userProfileBusinessType: {
                include: {
                  userProfileBusinessTypeTag: true,
                },
              },
            },
          },

          userBranch: {
            include: {
              userBranchBusinessType: {
                include: {
                  userBranch_BusinessType_Tag: true,
                },
              },

              userBranchTags: {
                include: {
                  userBranchTagsTag: true,
                },
              },
            },
          },
        },
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: vendorDetails,

        totalCount: 1,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in vendorDetails',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method vendorAllProduct
   * @description Retrieves all ACTIVE products for a specific vendor with brand,
   *   expiry, discount, and sell-type filtering.
   *
   * @intent Power the vendor's public storefront product listing.
   *
   * @usage Called by `ProductController.vendorAllProduct()` via `GET /product/vendorAllProduct`.
   *
   * @dataflow adminId -> Prisma product.findMany() where productPrice.adminId matches
   *   + status ACTIVE + includes -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @notes Only returns products with status 'ACTIVE' (more restrictive than findAll).
   *
   * @param {any} adminId - Vendor's user ID.
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request (reads sellType, expireDate, discount from query).
   * @param {any} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async vendorAllProduct(
    adminId: any,

    page: any,

    limit: any,

    req: any,

    brandIds: any,
  ) {
    // all Active product is shown

    try {
      let adminID = parseInt(adminId);

      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let today = new Date();

      const sellTypes = req.query.sellType
        ? req.query.sellType.split(',').map((type) => type.trim())
        : null;

      let whereCondition: any = {
        productType: 'P',

        status: { in: ['ACTIVE'] },

        product_productPrice: {
          some: {
            adminId: adminID,
          },
        },

        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
      };

      if (req.query.expireDate === 'expired') {
        whereCondition.product_productPrice.some = {
          ...whereCondition.product_productPrice.some,

          dateClose: { lt: today },
        };
      }

      if (req.query.discount === 'true') {
        whereCondition.product_productPrice.some = {
          ...whereCondition.product_productPrice.some,

          OR: [
            { vendorDiscount: { not: null } },

            { consumerDiscount: { not: null } },
          ],
        };
      }

      if (sellTypes?.length > 0) {
        whereCondition.product_productPrice.some = {
          ...whereCondition.product_productPrice.some,

          sellType: { in: sellTypes },
        };
      }

      let vendorAllProduct = await this.prisma.product.findMany({
        where: whereCondition,

        include: {
          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          placeOfOrigin: { where: { status: 'ACTIVE' } },

          productTags: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productTagsTag: true,
            },
          },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          // product_wishlist: {

          //   where: { userId: adminID },

          //   select: {

          //     userId: true,

          //     productId: true

          //   }

          // },

          product_productPrice: {
            where: {
              adminId: adminID,
            },

            include: {
              adminDetail: { where: { status: 'ACTIVE' } },
            },
          },
        },

        orderBy: { createdAt: 'desc' },

        skip, // Offset

        take: pageSize, // Limit
      });

      let vendorAllProductCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!vendorAllProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: vendorAllProduct,

        totalCount: vendorAllProductCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in vendorAllProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method findOneProductBySellerId
   * @description Retrieves a product with price entries filtered by a specific seller's admin ID.
   *
   * @intent Look up a product's details as seen by a particular seller (their pricing only).
   *
   * @usage Not currently exposed via any controller endpoint.
   *
   * @dataflow productId + userId -> Prisma product.findUnique() with adminId-scoped prices
   *   -> wishlist check -> other sellers -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Marked "Not in use" -- kept for potential future use.
   *
   * @param {any} productId - Product primary key.
   * @param {any} req - Express request object.
   * @param {any} userId - Seller/admin user ID.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  // Not in use

  async findOneProductBySellerId(
    productId: any,

    req: any,

    userId: any,

    sellerId: any,
  ) {
    try {
      let inWishlist = 0;

      let currentSeller;

      var otherSeller;

      // Type annotations and validations

      if (productId === null || productId === undefined || productId === '') {
        throw new Error('productId must not be empty');
      }

      if (sellerId === null || sellerId === undefined || sellerId === '') {
        throw new Error('sellerId must not be empty');
      }

      const productID = parseInt(productId);

      const userID = parseInt(userId);

      const sellerID = parseInt(sellerId);

      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },

        include: {
          category: {
            where: { status: 'ACTIVE' },

            include: {
              category_dynamicFormCategory: {
                include: {
                  formIdDetail: {
                    include: {
                      elements: true,
                    },
                  },
                },
              },
            },
          },

          brand: { where: { status: 'ACTIVE' } },

          placeOfOrigin: { where: { status: 'ACTIVE' } },

          productTags: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productTagsTag: true,
            },
          },

          productImages: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          product_productSpecification: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',

              adminId: sellerID,
            },

            include: {
              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },
        },
      });

      if (!productDetail) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,

          inWishlist: 0,

          otherSeller: [],
        };
      }

      if (productDetail && productDetail.product_productPrice) {
        currentSeller = productDetail?.product_productPrice;

        let currentSellerId = currentSeller[0].adminId;

        otherSeller = await this.prisma.productPrice.findMany({
          where: {
            productId: productID,

            adminId: {
              not: currentSellerId,
            },
          },

          include: {
            adminDetail: {
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

                    companyName: true,
                  },
                },
              },
            },
          },
        });
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetail,

        totalCount: 1,

        inWishlist: inWishlist,

        otherSeller: otherSeller ? otherSeller : [],
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in findOneProductBySellerId',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method delete
   * @description Soft-deletes a product by setting status to 'DELETE' and recording deletedAt.
   *
   * @intent Allow sellers to remove products without hard-deleting database records.
   *
   * @usage Called by `ProductController.delete()` via `DELETE /product/delete/:productId`.
   *
   * @dataflow productId -> Prisma product.update({ status: 'DELETE', deletedAt: new Date() })
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Follows the soft-delete pattern used throughout Ultrasooq.
   *
   * @param {any} productId - Product primary key.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async delete(productId: any, req: any) {
    try {
      let ID = parseInt(productId);

      let updatedProduct = await this.prisma.product.update({
        where: { id: ID },

        data: {
          status: 'DELETE',

          deletedAt: new Date(),
        },
      });

      // Invalidate product detail cache and listing caches
      await this.cacheService.invalidateProduct(ID);
      await this.cacheService.invalidateProductListings();

      return {
        status: true,

        message: 'Deleted Successfully',

        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in delete product',

        error: getErrorMessage(error),
      };
    }
  }

  // same product, different price for seller, starts **** ----

  /**
   * @method addPriceForProduct
   * @description Creates a new seller-specific price entry for an existing product,
   *   including barcode generation, variant, and geo sell-region associations.
   *
   * @intent Let a seller add their own pricing to an already-catalogued product.
   *
   * @usage Called by `ProductController.addPriceForProduct()` via `POST /product/addPriceForProduct`.
   *
   * @dataflow
   *   1. Resolve admin ID via HelperService.getAdminId()
   *   2. Prisma productPrice.create() with all pricing/sell/geo fields
   *   3. Create productVariant if provided
   *   4. Create geo sell regions (country/state/city)
   *   5. Generate barcode for the new price entry
   *   6. Return { status, message, data }
   *
   * @dependencies HelperService, PrismaClient, bwip-js
   *
   * @notes menuId assignment: 8=Store, 9=BuyGroup, 10=Factories.
   *
   * @param {any} payload - Pricing payload (productId, price fields, sell regions, etc.).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addPriceForProduct(payload: any, req: any) {
    return this.productPricingService.addPriceForProduct(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const adminId = req?.user?.id;

      const productId = payload?.productId;

      const productPrice = payload?.productPrice;

      const offerPrice = payload?.offerPrice;

      const stock = payload?.stock;

      const deliveryAfter = payload?.deliveryAfter;

      const timeOpen = payload?.timeOpen;

      const timeClose = payload?.timeClose;

      const consumerType = payload?.consumerType;

      const sellType = payload?.sellType;

      const vendorDiscount = payload?.vendorDiscount;

      const consumerDiscount = payload?.consumerDiscount;

      const minQuantity = payload?.minQuantity;

      const maxQuantity = payload?.maxQuantity;

      const productCondition = payload?.productCondition;

      const minCustomer = payload?.minCustomer;

      const maxCustomer = payload?.maxCustomer;

      const minQuantityPerCustomer = payload?.minQuantityPerCustomer;

      const maxQuantityPerCustomer = payload?.maxQuantityPerCustomer;

      if (!productId || !productPrice || !offerPrice) {
        return {
          status: false,

          message: 'productId or productPrice or offerPrice is missing',

          data: [],
        };
      }

      let existProductPrice = await this.prisma.productPrice.findFirst({
        where: {
          adminId: adminId,

          productId: productId,
        },
      });

      if (existProductPrice) {
        return {
          status: false,

          message: 'Already Added',

          data: existProductPrice,
        };
      }

      let addProdctPrice = await this.prisma.productPrice.create({
        data: {
          adminId: adminId,

          productId: productId,

          productPrice: productPrice,

          offerPrice: offerPrice,

          stock: stock || undefined,

          deliveryAfter: deliveryAfter || undefined,

          timeOpen: timeOpen || undefined,

          timeClose: timeClose || undefined,

          consumerType: consumerType || undefined,

          sellType: sellType || undefined,

          vendorDiscount: vendorDiscount || undefined,

          consumerDiscount: consumerDiscount || undefined,

          minQuantity: minQuantity || undefined,

          maxQuantity: maxQuantity || undefined,

          productCondition: productCondition || undefined,

          minCustomer: minCustomer || undefined,

          maxCustomer: maxCustomer || undefined,

          minQuantityPerCustomer: minQuantityPerCustomer || undefined,

          maxQuantityPerCustomer: maxQuantityPerCustomer || undefined,
        },
      });

      // Send buygroup sale notification if it's a buygroup sale with future dates
      // Note: addPriceForProduct doesn't have dateOpen/dateClose parameters
      // This notification will be handled by the scheduler or when product is updated

      return {
        status: true,

        message: 'Created Successfully',

        data: addProdctPrice,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in addPriceForProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method addMultiplePriceForProduct
   * @description Creates multiple seller-specific price entries in one request,
   *   each targeting a different product.
   *
   * @intent Batch onboarding of seller prices across multiple catalogue products.
   *
   * @usage Called by `ProductController.addMultiplePriceForProduct()` via
   *   `POST /product/addMultiplePriceForProduct`.
   *
   * @dataflow payload.productPrice[] -> loop -> Prisma productPrice.create() per entry
   *   -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes Each entry includes askForStock/askForPrice string boolean flags.
   *
   * @param {AddMultiplePriceForProductDTO} payload - Validated array wrapper.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addMultiplePriceForProduct(
    payload: AddMultiplePriceForProductDTO,

    req: any,
  ) {
    return this.productPricingService.addMultiplePriceForProduct(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const adminId = req?.user?.id;

      const productPriceList = [];

      if (payload?.productPrice && payload?.productPrice.length > 0) {
        for (let i = 0; i < payload?.productPrice.length; i++) {
          let existProductPrice = await this.prisma.productPrice.findFirst({
            where: {
              adminId: adminId,

              productId: payload?.productPrice[i]?.productId,
            },
          });

          if (!existProductPrice) {
            let addProductPrice = await this.prisma.productPrice.create({
              data: {
                adminId: adminId,

                productId: payload.productPrice[i].productId,

                productPrice: payload.productPrice[i].productPrice || 0.0,

                offerPrice: payload.productPrice[i].offerPrice || 0.0,

                status: payload.productPrice[i].status || 'INACTIVE',

                askForStock: payload?.productPrice[i]?.askForStock || 'false',

                askForPrice: payload?.productPrice[i]?.askForPrice || 'false',
              },
            });

            productPriceList.push(addProductPrice);

            try {
              const barcodeImageProductPrice =
                await this.generateBarcodeForProductPrice(
                  payload.productPrice[i].productId.toString(),

                  addProductPrice.id.toString(),

                  adminId.toString(),
                );

              await this.prisma.productPrice.update({
                where: { id: addProductPrice.id },

                data: { productPriceBarcode: barcodeImageProductPrice },
              });
            } catch (error) {
            }
          }
        }

        return {
          status: true,

          message: 'Created Successfully',

          data: productPriceList,
        };
      } else {
        return {
          status: false,

          message: 'Something when wrong!',

          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,

        message: 'error, in addMultiplePriceForProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateMultipleProductPrice
   * @description Updates multiple product-price records in a single request.
   *
   * @intent Batch modification of seller prices, discounts, stock, and sell options.
   *
   * @usage Called by `ProductController.updateMultipleProductPrice()` via
   *   `PATCH /product/updateMultipleProductPrice`.
   *
   * @dataflow payload.productPrice[] -> loop -> Prisma productPrice.update() per entry
   *   -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes Each entry is identified by productPriceId; all other fields are optional.
   *
   * @param {UpdateMultiplePriceForProductDTO} payload - Validated array wrapper.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateMultipleProductPrice(
    payload: UpdateMultiplePriceForProductDTO,

    req: any,
  ) {
    return this.productPricingService.updateMultipleProductPrice(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const adminId = req?.user?.id;

      const productPriceList = [];

      if (payload?.productPrice && payload?.productPrice.length > 0) {
        for (let i = 0; i < payload?.productPrice.length; i++) {
          let existProductPrice = await this.prisma.productPrice.findUnique({
            where: { id: payload?.productPrice[i].productPriceId },
          });


          if (existProductPrice) {
            // Store old values for comparison
            const oldStock = existProductPrice.stock || 0;
            const oldOfferPrice = Number(existProductPrice.offerPrice) || 0;
            const newStock =
              payload?.productPrice[i]?.stock !== undefined
                ? payload.productPrice[i].stock
                : oldStock;
            const newOfferPrice =
              payload?.productPrice[i]?.offerPrice !== undefined
                ? Number(payload.productPrice[i].offerPrice)
                : oldOfferPrice;

            let updatedProductPrice = await this.prisma.productPrice.update({
              where: { id: payload?.productPrice[i].productPriceId },

              data: {
                status:
                  payload?.productPrice[i]?.status || existProductPrice?.status,

                productPrice: payload?.productPrice[i]?.productPrice, // || existProductPrice?.productPrice,

                offerPrice: payload?.productPrice[i]?.offerPrice, // || existProductPrice?.offerPrice,

                stock: payload?.productPrice[i]?.stock, //|| existProductPrice?.stock,

                deliveryAfter:
                  payload?.productPrice[i]?.deliveryAfter !== undefined
                    ? payload?.productPrice[i]?.deliveryAfter
                    : existProductPrice?.deliveryAfter,

                timeOpen:
                  payload?.productPrice[i]?.timeOpen !== undefined
                    ? payload?.productPrice[i]?.timeOpen
                    : existProductPrice?.timeOpen,

                timeClose:
                  payload?.productPrice[i]?.timeClose !== undefined
                    ? payload?.productPrice[i]?.timeClose
                    : existProductPrice?.timeClose,

                consumerType:
                  payload?.productPrice[i]?.consumerType ||
                  existProductPrice?.consumerType,

                sellType:
                  payload?.productPrice[i]?.sellType ||
                  existProductPrice?.sellType,

                vendorDiscount:
                  payload?.productPrice[i]?.vendorDiscount !== undefined
                    ? payload?.productPrice[i]?.vendorDiscount
                    : existProductPrice?.vendorDiscount,

                vendorDiscountType:
                  payload?.productPrice[i]?.vendorDiscountType !== undefined
                    ? payload?.productPrice[i]?.vendorDiscountType
                    : existProductPrice?.vendorDiscountType,

                consumerDiscount:
                  payload?.productPrice[i]?.consumerDiscount !== undefined
                    ? payload?.productPrice[i]?.consumerDiscount
                    : existProductPrice?.consumerDiscount,

                consumerDiscountType:
                  payload?.productPrice[i]?.consumerDiscountType !== undefined
                    ? payload?.productPrice[i]?.consumerDiscountType
                    : existProductPrice?.consumerDiscountType,

                minQuantity:
                  payload?.productPrice[i]?.minQuantity !== undefined
                    ? payload?.productPrice[i]?.minQuantity
                    : existProductPrice?.minQuantity,

                maxQuantity:
                  payload?.productPrice[i]?.maxQuantity !== undefined
                    ? payload?.productPrice[i]?.maxQuantity
                    : existProductPrice?.maxQuantity,

                productCondition:
                  payload?.productPrice[i]?.productCondition ||
                  existProductPrice?.productCondition,

                minCustomer:
                  payload?.productPrice[i]?.minCustomer !== undefined
                    ? payload?.productPrice[i]?.minCustomer
                    : existProductPrice?.minCustomer,

                maxCustomer:
                  payload?.productPrice[i]?.maxCustomer !== undefined
                    ? payload?.productPrice[i]?.maxCustomer
                    : existProductPrice?.maxCustomer,

                minQuantityPerCustomer:
                  payload?.productPrice[i]?.minQuantityPerCustomer !== undefined
                    ? payload?.productPrice[i]?.minQuantityPerCustomer
                    : existProductPrice?.minQuantityPerCustomer,

                maxQuantityPerCustomer:
                  payload?.productPrice[i]?.maxQuantityPerCustomer !== undefined
                    ? payload?.productPrice[i]?.maxQuantityPerCustomer
                    : existProductPrice?.maxQuantityPerCustomer,

                askForStock:
                  payload?.productPrice[i]?.askForStock ||
                  existProductPrice?.askForStock,

                askForPrice:
                  payload?.productPrice[i]?.askForPrice ||
                  existProductPrice?.askForPrice,

                askForSell:
                  payload?.productPrice[i]?.askForSell ||
                  existProductPrice?.askForSell,

                hideAllSelected:
                  payload?.productPrice[i]?.hideAllSelected !== undefined
                    ? payload?.productPrice[i]?.hideAllSelected
                    : existProductPrice?.hideAllSelected,

                enableChat:
                  payload?.productPrice[i]?.enableChat !== undefined
                    ? payload?.productPrice[i]?.enableChat
                    : existProductPrice?.enableChat,
              },
            });

            // Get product details for notifications
            const product = await this.prisma.product.findUnique({
              where: { id: existProductPrice.productId },
              select: { productName: true },
            });

            // Check for stock changes and notify users with product in wishlist
            if (oldStock !== newStock && product) {
              try {
                const wishlistUsers = await this.prisma.wishlist.findMany({
                  where: {
                    productId: existProductPrice.productId,
                    status: 'ACTIVE',
                  },
                  select: { userId: true },
                  distinct: ['userId'],
                });

                for (const wishlistUser of wishlistUsers) {
                  if (oldStock > 0 && newStock === 0) {
                    // Out of stock
                    await this.notificationService.createNotification({
                      userId: wishlistUser.userId,
                      type: 'STOCK',
                      title: 'Product Out of Stock',
                      message: `${product.productName} is now out of stock. We'll notify you when it's back!`,
                      data: {
                        productId: existProductPrice.productId,
                        productPriceId: existProductPrice.id,
                        productName: product.productName,
                        stockLevel: 0,
                        changeType: 'out_of_stock',
                      },
                      link: `/trending/${existProductPrice.productId}`,
                      icon: '📦',
                    });
                  } else if (oldStock === 0 && newStock > 0) {
                    // Back in stock
                    await this.notificationService.createNotification({
                      userId: wishlistUser.userId,
                      type: 'STOCK',
                      title: 'Product Back in Stock',
                      message: `Great news! ${product.productName} is back in stock. Order now!`,
                      data: {
                        productId: existProductPrice.productId,
                        productPriceId: existProductPrice.id,
                        productName: product.productName,
                        stockLevel: newStock,
                        changeType: 'back_in_stock',
                      },
                      link: `/trending/${existProductPrice.productId}`,
                      icon: '✅',
                    });
                  } else if (newStock > 0 && newStock <= 10 && oldStock > 10) {
                    // Low stock
                    await this.notificationService.createNotification({
                      userId: wishlistUser.userId,
                      type: 'STOCK',
                      title: 'Low Stock Alert',
                      message: `${product.productName} is running low on stock. Only ${newStock} left!`,
                      data: {
                        productId: existProductPrice.productId,
                        productPriceId: existProductPrice.id,
                        productName: product.productName,
                        stockLevel: newStock,
                        changeType: 'low_stock',
                      },
                      link: `/trending/${existProductPrice.productId}`,
                      icon: '⚠️',
                    });
                  }
                }
              } catch (notificationError) {
              }
            }

            // Check for price changes and notify users with product in wishlist
            if (
              oldOfferPrice !== newOfferPrice &&
              product &&
              oldOfferPrice > 0
            ) {
              try {
                const wishlistUsers = await this.prisma.wishlist.findMany({
                  where: {
                    productId: existProductPrice.productId,
                    status: 'ACTIVE',
                  },
                  select: { userId: true },
                  distinct: ['userId'],
                });

                const isPriceDrop = newOfferPrice < oldOfferPrice;
                const title = isPriceDrop ? 'Price Drop!' : 'Price Changed';
                const message = isPriceDrop
                  ? `Great news! The price of ${product.productName} has dropped to $${newOfferPrice}`
                  : `The price of ${product.productName} has changed from $${oldOfferPrice} to $${newOfferPrice}`;
                const icon = isPriceDrop ? '💰' : '📊';

                for (const wishlistUser of wishlistUsers) {
                  await this.notificationService.createNotification({
                    userId: wishlistUser.userId,
                    type: 'PRICE',
                    title,
                    message,
                    data: {
                      productId: existProductPrice.productId,
                      productPriceId: existProductPrice.id,
                      productName: product.productName,
                      oldPrice: oldOfferPrice,
                      newPrice: newOfferPrice,
                      currency: 'USD',
                      isPriceDrop,
                    },
                    link: `/trending/${existProductPrice.productId}`,
                    icon,
                  });
                }
              } catch (notificationError) {
              }
            }

            productPriceList.push(updatedProductPrice);
          }
        }

        return {
          status: true,

          message: 'Updated Successfully',

          data: productPriceList,
        };
      } else {
        return {
          status: false,

          message: 'Something went wrong!',

          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,

        message: 'error, in updateMultipleProductPrice',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method bulkHideShowProducts
   * @description Toggles visibility (ACTIVE/HIDDEN) for multiple product-price records.
   *
   * @intent Allow sellers to quickly hide or show a batch of price listings.
   *
   * @usage Called by `ProductController.bulkHideShowProducts()` via `PATCH /product/bulkHideShow`.
   *
   * @dataflow payload.productPriceIds[] + payload.hide -> loop -> Prisma productPrice.update()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes `hide: true` sets status to 'HIDDEN'; `hide: false` sets status to 'ACTIVE'.
   *
   * @param {{ productPriceIds: number[]; hide: boolean }} payload - IDs and visibility flag.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async bulkHideShowProducts(
    payload: { productPriceIds: number[]; hide: boolean },
    req: any,
  ) {
    return this.productPricingService.bulkHideShowProducts(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const { productPriceIds, hide } = payload;
      const status = hide ? 'HIDDEN' : 'ACTIVE';


      // First, get the product prices that belong to the user
      const userProductPrices = await this.prisma.productPrice.findMany({
        where: {
          id: {
            in: productPriceIds,
          },
          productPrice_product: {
            adminId: req.user.id,
          },
        },
        select: {
          id: true,
        },
      });

      const validProductPriceIds = userProductPrices.map((pp) => pp.id);

      if (validProductPriceIds.length === 0) {
        return {
          status: false,
          message: 'No products found that belong to you.',
          data: [],
        };
      }

      // Update only the product prices that belong to the user
      const updateResult = await this.prisma.productPrice.updateMany({
        where: {
          id: {
            in: validProductPriceIds,
          },
        },
        data: {
          status: status as any,
        },
      });


      if (updateResult.count > 0) {
        return {
          status: true,
          message: `Successfully ${hide ? 'hidden' : 'shown'} ${updateResult.count} products ${hide ? 'from' : 'to'} customers`,
          data: {
            updatedCount: updateResult.count,
            action: hide ? 'hidden' : 'shown',
          },
        };
      } else {
        return {
          status: false,
          message:
            'No products were updated. Please check if the products exist and belong to you.',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error updating product visibility',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method bulkProductCondition
   * @description Updates the product condition label for multiple product-price records.
   *
   * @intent Batch-update condition (NEW, USED, REFURBISHED) across multiple listings.
   *
   * @usage Called by `ProductController.bulkProductCondition()` via `PATCH /product/bulkProductCondition`.
   *
   * @dataflow payload.productPriceIds[] + payload.productCondition -> loop -> Prisma update
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {{ productPriceIds: number[]; productCondition: string }} payload - IDs and condition.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async bulkProductCondition(
    payload: { productPriceIds: number[]; productCondition: string },
    req: any,
  ) {
    return this.productPricingService.bulkProductCondition(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const { productPriceIds, productCondition } = payload;


      // First, get the product prices that belong to the user
      const userProductPrices = await this.prisma.productPrice.findMany({
        where: {
          id: {
            in: productPriceIds,
          },
          productPrice_product: {
            adminId: req.user.id,
          },
        },
        select: {
          id: true,
        },
      });

      const validProductPriceIds = userProductPrices.map((pp) => pp.id);

      if (validProductPriceIds.length === 0) {
        return {
          status: false,
          message: 'No products found that belong to you.',
          data: [],
        };
      }

      // Update only the product prices that belong to the user
      const updateResult = await this.prisma.productPrice.updateMany({
        where: {
          id: {
            in: validProductPriceIds,
          },
        },
        data: {
          productCondition: productCondition,
        },
      });


      if (updateResult.count > 0) {
        return {
          status: true,
          message: `Successfully updated product condition to "${productCondition}" for ${updateResult.count} products`,
          data: {
            updatedCount: updateResult.count,
            productCondition: productCondition,
          },
        };
      } else {
        return {
          status: false,
          message:
            'No products were updated. Please check if the products exist and belong to you.',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error updating product condition',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method bulkDiscountUpdate
   * @description Updates discount settings (vendor/consumer discount percentages and types)
   *   for multiple product-price records.
   *
   * @intent Batch-apply discount configurations across many seller listings.
   *
   * @usage Called by `ProductController.bulkDiscountUpdate()` via `PATCH /product/bulkDiscountUpdate`.
   *
   * @dataflow payload.productPriceIds[] + payload.discountData -> loop -> Prisma update
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {{ productPriceIds: number[]; discountData: any }} payload - IDs and discount config.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async bulkDiscountUpdate(
    payload: { productPriceIds: number[]; discountData: any },
    req: any,
  ) {
    return this.productPricingService.bulkDiscountUpdate(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const { productPriceIds, discountData } = payload;


      // First, get the product prices that belong to the user
      const userProductPrices = await this.prisma.productPrice.findMany({
        where: {
          id: {
            in: productPriceIds,
          },
          productPrice_product: {
            adminId: req.user.id,
          },
        },
        select: {
          id: true,
        },
      });

      const validProductPriceIds = userProductPrices.map((pp) => pp.id);

      if (validProductPriceIds.length === 0) {
        return {
          status: false,
          message: 'No products found that belong to you.',
          data: [],
        };
      }

      // Prepare update data
      const updateData: any = {};

      // Required fields
      if (discountData.consumerType)
        updateData.consumerType = discountData.consumerType;
      if (discountData.sellType) updateData.sellType = discountData.sellType;

      // Optional numeric fields (use !== undefined to allow 0 values)
      if (discountData.deliveryAfter !== undefined)
        updateData.deliveryAfter = discountData.deliveryAfter;
      if (discountData.vendorDiscount !== undefined)
        updateData.vendorDiscount = discountData.vendorDiscount;
      if (discountData.consumerDiscount !== undefined)
        updateData.consumerDiscount = discountData.consumerDiscount;
      if (discountData.minQuantity !== undefined)
        updateData.minQuantity = discountData.minQuantity;
      if (discountData.maxQuantity !== undefined)
        updateData.maxQuantity = discountData.maxQuantity;
      if (discountData.minCustomer !== undefined)
        updateData.minCustomer = discountData.minCustomer;
      if (discountData.maxCustomer !== undefined)
        updateData.maxCustomer = discountData.maxCustomer;
      if (discountData.minQuantityPerCustomer !== undefined)
        updateData.minQuantityPerCustomer = discountData.minQuantityPerCustomer;
      if (discountData.maxQuantityPerCustomer !== undefined)
        updateData.maxQuantityPerCustomer = discountData.maxQuantityPerCustomer;
      if (discountData.timeOpen !== undefined)
        updateData.timeOpen = discountData.timeOpen;
      if (discountData.timeClose !== undefined)
        updateData.timeClose = discountData.timeClose;

      // Optional string fields
      if (discountData.vendorDiscountType)
        updateData.vendorDiscountType = discountData.vendorDiscountType;
      if (discountData.consumerDiscountType)
        updateData.consumerDiscountType = discountData.consumerDiscountType;


      // Update only the product prices that belong to the user
      const updateResult = await this.prisma.productPrice.updateMany({
        where: {
          id: {
            in: validProductPriceIds,
          },
        },
        data: updateData,
      });


      if (updateResult.count > 0) {
        return {
          status: true,
          message: `Successfully updated discount settings for ${updateResult.count} products`,
          data: {
            updatedCount: updateResult.count,
            updatedFields: Object.keys(updateData),
          },
        };
      } else {
        return {
          status: false,
          message:
            'No products were updated. Please check if the products exist and belong to you.',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error updating discount settings',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method bulkWhereToSellUpdate
   * @description Updates geographic sell regions (country, state, city) for multiple
   *   product-price records using a delete-and-recreate strategy.
   *
   * @intent Batch-update where products are available for sale.
   *
   * @usage Called by `ProductController.bulkWhereToSellUpdate()` via
   *   `PATCH /product/bulkWhereToSellUpdate`.
   *
   * @dataflow payload.productPriceIds[] + payload.locationData -> per price ID:
   *   delete existing geo rows -> create new geo rows -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Deletes ALL existing sell-country/state/city rows for each price before recreating.
   *
   * @param {{ productPriceIds: number[]; locationData: any }} payload - IDs and location config.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async bulkWhereToSellUpdate(
    payload: { productPriceIds: number[]; locationData: any },
    req: any,
  ) {
    return this.productPricingService.bulkWhereToSellUpdate(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const { productPriceIds, locationData } = payload;


      // First, get the product prices that belong to the user
      const userProductPrices = await this.prisma.productPrice.findMany({
        where: {
          id: {
            in: productPriceIds,
          },
          productPrice_product: {
            adminId: req.user.id,
          },
        },
        select: {
          id: true,
        },
      });

      const validProductPriceIds = userProductPrices.map((pp) => pp.id);

      if (validProductPriceIds.length === 0) {
        return {
          status: false,
          message: 'No products found that belong to you.',
          data: [],
        };
      }

      // Handle location updates using separate tables and product updates
      let updateCount = 0;

      for (const productPriceId of validProductPriceIds) {
        // Get the product price to find the associated product
        const productPrice = await this.prisma.productPrice.findUnique({
          where: { id: productPriceId },
          select: { id: true, productId: true },
        });

        if (!productPrice || !productPrice.productId) {
          continue;
        }

        const productId = productPrice.productId;

        // Update sell countries
        if (
          locationData.sellCountryIds &&
          locationData.sellCountryIds.length > 0
        ) {
          // Delete existing sell countries for this product
          await this.prisma.productSellCountry.deleteMany({
            where: {
              productId: productId,
              productPriceId: productPriceId,
            },
          });

          // Insert new sell countries
          const sellCountries = locationData.sellCountryIds.map(
            (country: any) => ({
              productId: productId,
              productPriceId: productPriceId,
              countryId: parseInt(country.value),
              countryName: country.label,
            }),
          );

          await this.prisma.productSellCountry.createMany({
            data: sellCountries,
          });
        }

        // Update sell states
        if (locationData.sellStateIds && locationData.sellStateIds.length > 0) {
          // Delete existing sell states for this product
          await this.prisma.productSellState.deleteMany({
            where: {
              productId: productId,
              productPriceId: productPriceId,
            },
          });

          // Insert new sell states
          const sellStates = locationData.sellStateIds.map((state: any) => ({
            productId: productId,
            productPriceId: productPriceId,
            stateId: parseInt(state.value),
            stateName: state.label,
          }));

          await this.prisma.productSellState.createMany({
            data: sellStates,
          });
        }

        // Update sell cities
        if (locationData.sellCityIds && locationData.sellCityIds.length > 0) {
          // Delete existing sell cities for this product
          await this.prisma.productSellCity.deleteMany({
            where: {
              productId: productId,
              productPriceId: productPriceId,
            },
          });

          // Insert new sell cities
          const sellCities = locationData.sellCityIds.map((city: any) => ({
            productId: productId,
            productPriceId: productPriceId,
            cityId: parseInt(city.value),
            cityName: city.label,
          }));

          await this.prisma.productSellCity.createMany({
            data: sellCities,
          });
        }

        // Update place of origin at product level
        // Note: Temporarily disabled due to foreign key constraint issues
        // The placeOfOriginId references CountryList table, but frontend sends Countries table IDs
        // TODO: Fix the mapping between Countries and CountryList tables
        // if (locationData.placeOfOriginId) {
        //   await this.prisma.product.update({
        //     where: { id: productId },
        //     data: {
        //       placeOfOriginId: parseInt(locationData.placeOfOriginId),
        //     },
        //   });
        // }

        updateCount++;
      }


      if (updateCount > 0) {
        const updatedFields = [];
        if (
          locationData.sellCountryIds &&
          locationData.sellCountryIds.length > 0
        )
          updatedFields.push('sellCountries');
        if (locationData.sellStateIds && locationData.sellStateIds.length > 0)
          updatedFields.push('sellStates');
        if (locationData.sellCityIds && locationData.sellCityIds.length > 0)
          updatedFields.push('sellCities');
        // Place of origin temporarily disabled - see TODO above
        // if (locationData.placeOfOriginId) updatedFields.push('placeOfOrigin');

        return {
          status: true,
          message: `Successfully updated where to sell settings for ${updateCount} products`,
          data: {
            updatedCount: updateCount,
            updatedFields: updatedFields,
          },
        };
      } else {
        return {
          status: false,
          message:
            'No products were updated. Please check if the products exist and belong to you.',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error updating where to sell settings',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method bulkAskForUpdate
   * @description Updates "ask for" flags (askForPrice, askForStock, askForSell) for
   *   multiple product-price records.
   *
   * @intent Batch-toggle whether buyers must request pricing/stock info from the seller.
   *
   * @usage Called by `ProductController.bulkAskForUpdate()` via `PATCH /product/bulkAskForUpdate`.
   *
   * @dataflow payload.productPriceIds[] + payload.askForData -> loop -> Prisma update
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {{ productPriceIds: number[]; askForData: any }} payload - IDs and ask-for flags.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async bulkAskForUpdate(
    payload: { productPriceIds: number[]; askForData: any },
    req: any,
  ) {
    return this.productPricingService.bulkAskForUpdate(payload, req);
    // --- Delegated to ProductPricingService ---
    try {
      const { productPriceIds, askForData } = payload;


      // First, get the product prices that belong to the user
      const userProductPrices = await this.prisma.productPrice.findMany({
        where: {
          id: {
            in: productPriceIds,
          },
          productPrice_product: {
            adminId: req.user.id,
          },
        },
        select: {
          id: true,
        },
      });

      const validProductPriceIds = userProductPrices.map((pp) => pp.id);

      if (validProductPriceIds.length === 0) {
        return {
          status: false,
          message: 'No products found that belong to you.',
          data: [],
        };
      }

      // Prepare update data
      const updateData: any = {};

      // Ask For fields
      if (
        askForData.askForPrice !== undefined &&
        askForData.askForPrice !== ''
      ) {
        updateData.askForPrice = askForData.askForPrice;
      }
      if (
        askForData.askForStock !== undefined &&
        askForData.askForStock !== ''
      ) {
        updateData.askForStock = askForData.askForStock;
      }


      // Update only the product prices that belong to the user
      const updateResult = await this.prisma.productPrice.updateMany({
        where: {
          id: {
            in: validProductPriceIds,
          },
        },
        data: updateData,
      });


      if (updateResult.count > 0) {
        const updatedFields = [];
        if (askForData.askForPrice) updatedFields.push('askForPrice');
        if (askForData.askForStock) updatedFields.push('askForStock');

        return {
          status: true,
          message: `Successfully updated ask for settings for ${updateResult.count} products`,
          data: {
            updatedCount: updateResult.count,
            updatedFields: updatedFields,
          },
        };
      } else {
        return {
          status: false,
          message:
            'No products were updated. Please check if the products exist and belong to you.',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error updating ask for settings',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllProductPriceByUser
   * @description Retrieves all product-price entries owned by the authenticated user
   *   with pagination, search, brand, and sell-type filtering.
   *
   * @intent Power the seller's "My Prices" dashboard listing.
   *
   * @usage Called by `ProductController.getAllProductPriceByUser()` via
   *   `GET /product/getAllProductPriceByUser`.
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma productPrice.findMany()
   *   with product includes -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes Also reads `req.query.sellType` for additional sell-type filtering.
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with user and query params.
   * @param {any} term - Search term for product name.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllProductPriceByUser(
    page: any,

    limit: any,

    req: any,

    term: any,

    brandIds: any,
  ) {
    return this.productPricingService.getAllProductPriceByUser(page, limit, req, term, brandIds);
    // --- Delegated to ProductPricingService ---
    try {
      let adminId = req?.user?.id;

      if (req?.query?.selectedAdminId) {
        adminId = parseInt(req.query.selectedAdminId);
      }

      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const sortType = 'desc'; //sort ? sort : 'desc';

      let today = new Date();

      // Determine the status filter

      let statusFilter = req.query.status
        ? req.query.status
        : { not: 'DELETE' };

      let whereCondition: any = {
        status: statusFilter,

        adminId: adminId,

        productPrice_product: {
          productType: 'P',

          productName: {
            contains: searchTerm,

            mode: 'insensitive',
          },

          brandId: brandIds
            ? {
                in: brandIds.split(',').map((id) => parseInt(id.trim())),
              }
            : undefined,
        },
      };

      // Apply expireDate filter if requested

      if (req.query.expireDate === 'active') {
        whereCondition.dateClose = { gte: today }; // Active products (dateClose >= today)
      } else if (req.query.expireDate === 'expired') {
        whereCondition.dateClose = { lt: today }; // Expired products (dateClose < today)
      }

      const sellTypes = req.query.sellType
        ? req.query.sellType.split(',').map((type) => type.trim())
        : null;

      if (sellTypes) {
        whereCondition.sellType = { in: sellTypes };
      }

      // Apply discount filter if requested (if either discount is not null)

      if (req.query.discount === 'true') {
        whereCondition.OR = [
          { vendorDiscount: { not: null } },

          { consumerDiscount: { not: null } },
        ];
      }

      let getAllProductPrice = await this.prisma.productPrice.findMany({
        where: whereCondition,

        include: {
          productPrice_product: {
            include: {
              productImages: true,
            },
          },

          productPrice_productSellerImage: true,
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      if (!getAllProductPrice) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      let getAllProductPriceCount = await this.prisma.productPrice.count({
        // where: { adminId: adminId }

        where: whereCondition,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllProductPrice,

        totalCount: getAllProductPriceCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllProductPriceByUser',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneProductByProductCondition
   * @description Retrieves a product and its price entry filtered by product condition,
   *   including custom field values.
   *
   * @intent Power the product-condition-specific view (NEW vs USED listings).
   *
   * @usage Called by `ProductController.getOneProductByProductCondition()` via
   *   `GET /product/getOneProductByProductCondition`.
   *
   * @dataflow productId + productPriceId -> Prisma product + price + custom fields queries
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} productId - Product primary key.
   * @param {any} req - Express request.
   * @param {any} productPriceId - ProductPrice primary key.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneProductByProductCondition(
    productId: any,

    req: any,

    productPriceId: any,
  ) {
    try {
      const productID = parseInt(productId);

      const productPriceID = parseInt(productPriceId);

      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },

        include: {
          productImages: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          product_productSpecification: { where: { status: 'ACTIVE' } },

          product_productPrice: {
            where: {
              id: productPriceID,
            },

            include: {
              productPrice_productSellerImage: true,
            },
          },
          category: true,
          productTags: {
            include: {
              productTagsTag: true,
            },
          },
        },
      });

      if (!productDetail) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetail,

        totalCount: 1,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getOneProduct',

        error: getErrorMessage(error),
      };
    }
  }

  // not in use

  /**
   * @method editProductPriceByProductCondition
   * @description Updates a product-price record and its associated custom field values
   *   within a specific condition context.
   *
   * @intent Allow sellers to edit price details for a specific condition variant.
   *
   * @usage Called by `ProductController.editProductPriceByProductCondition()` via
   *   `PATCH /product/editProductPriceByProductCondition`.
   *
   * @dataflow payload (productPriceId + field overrides + custom fields)
   *   -> Prisma productPrice.update() + custom-field upserts
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Update payload with productPriceId and field overrides.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async editProductPriceByProductCondition(payload: any, req: any) {
    try {
      const productId = payload?.productId;

      const productPriceId = payload?.productPriceId;

      let productDetail = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      let updatedProduct = await this.prisma.product.update({
        where: { id: productId },

        data: {
          description: payload.description || productDetail.description,
        },
      });

      if (
        payload?.productShortDescriptionList &&
        payload?.productShortDescriptionList.length > 0
      ) {
        let pre = await this.prisma.productShortDescription.findFirst({
          where: { productId: productId },
        });

        await this.prisma.productShortDescription.deleteMany({
          where: { productId: productId },
        });

        for (let s = 0; s < payload.productShortDescriptionList.length; s++) {
          let addProductImages = await this.prisma.productShortDescription.create({
            data: {
              productId: productId,

              adminId: pre?.adminId,

              shortDescription:
                payload?.productShortDescriptionList[s]?.shortDescription,
            },
          });
        }
      }

      if (
        payload?.productSpecificationList &&
        payload?.productSpecificationList.length > 0
      ) {
        let preProductSpecification =
          await this.prisma.productSpecification.findFirst({
            where: { productId: productId },
          });

        await this.prisma.productSpecification.deleteMany({
          where: { productId: productId },
        });

        for (let i = 0; i < payload.productSpecificationList.length; i++) {
          let addProductSpecifications =
            await this.prisma.productSpecification.create({
              data: {
                productId: productId,

                adminId: preProductSpecification?.adminId,

                label: payload?.productSpecificationList[i]?.label,

                specification:
                  payload?.productSpecificationList[i]?.specification,
              },
            });
        }
      }

      if (
        payload?.productSellerImageList &&
        payload?.productSellerImageList.length > 0
      ) {
        await this.prisma.productSellerImage.deleteMany({
          where: { productPriceId: productPriceId },
        });

        for (let i = 0; i < payload.productSellerImageList.length; i++) {
          let addProductSellerImage = await this.prisma.productSellerImage.create({
            data: {
              productPriceId:
                payload?.productSellerImageList[i]?.productPriceId,

              imageName: payload?.productSellerImageList[i]?.imageName,

              image: payload?.productSellerImageList[i]?.image,

              videoName: payload?.productSellerImageList[i]?.videoName,

              video: payload?.productSellerImageList[i]?.video,
            },
          });
        }
      }

      return {
        status: true,

        message: 'Updated Successfully',

        data: [],
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getOneProductByProductCondition',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateProductPrice
   * @description Updates a single product-price record with full field support,
   *   including geo sell regions, seller images, and all pricing/discount fields.
   *
   * @intent Allow a seller to modify all aspects of a specific price listing.
   *
   * @usage Called by `ProductController.updateProductPrice()` via
   *   `PATCH /product/updateProductPrice`.
   *
   * @dataflow UpdatedProductPriceDto -> Prisma productPrice.update()
   *   + delete-and-recreate geo regions + seller-image upserts
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Also reads additional payload fields from `req.body` beyond the DTO
   *   (sellCountryIds, sellStateIds, sellCityIds, productPriceSellerImages).
   *
   * @param {UpdatedProductPriceDto} updatedProductPriceDto - Validated price update DTO.
   * @param {any} req - Express request with `user.id` and additional body fields.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateProductPrice(
    updatedProductPriceDto: UpdatedProductPriceDto,

    req: any,
  ) {
    return this.productPricingService.updateProductPrice(updatedProductPriceDto, req);
    // --- Delegated to ProductPricingService ---
    try {
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: null,
        };
      }

      const productPriceId = updatedProductPriceDto?.productPriceId;

      const existProductPrice = await this.prisma.productPrice.findUnique({
        where: {
          id: productPriceId,
          adminId: adminId, // Ensure user can only update their own products
        },
      });

      if (!existProductPrice) {
        return {
          status: false,

          message:
            'Product price not found or you do not have permission to update it',

          data: null,
        };
      }

      // First, get the productId from the productPrice record
      const productId = existProductPrice.productId;

      // Update the main product table with the new prices
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          productPrice:
            updatedProductPriceDto?.productPrice ||
            existProductPrice?.productPrice,
          offerPrice:
            updatedProductPriceDto?.offerPrice || existProductPrice?.offerPrice,
        },
      });

      // Store old values for comparison
      const oldStock = existProductPrice.stock || 0;
      const oldOfferPrice = Number(existProductPrice.offerPrice) || 0;
      const newStock =
        updatedProductPriceDto?.stock !== undefined
          ? updatedProductPriceDto.stock
          : oldStock;
      const newOfferPrice =
        updatedProductPriceDto?.offerPrice !== undefined
          ? Number(updatedProductPriceDto.offerPrice)
          : oldOfferPrice;

      let updatedProductPrice = await this.prisma.productPrice.update({
        where: { id: productPriceId },

        data: {
          productPrice:
            updatedProductPriceDto?.productPrice ||
            existProductPrice?.productPrice,

          offerPrice:
            updatedProductPriceDto?.offerPrice || existProductPrice?.offerPrice,

          stock: updatedProductPriceDto?.stock || existProductPrice?.stock,

          askForPrice:
            updatedProductPriceDto?.askForPrice ||
            existProductPrice?.askForPrice,

          askForStock:
            updatedProductPriceDto?.askForStock ||
            existProductPrice?.askForStock,

          askForSell:
            updatedProductPriceDto?.askForSell || existProductPrice?.askForSell,

          hideAllSelected:
            updatedProductPriceDto?.hideAllSelected !== undefined
              ? updatedProductPriceDto?.hideAllSelected
              : existProductPrice?.hideAllSelected,

          enableChat:
            updatedProductPriceDto?.enableChat !== undefined
              ? updatedProductPriceDto?.enableChat
              : existProductPrice?.enableChat,

          deliveryAfter:
            updatedProductPriceDto?.deliveryAfter ||
            existProductPrice?.deliveryAfter,

          timeOpen:
            updatedProductPriceDto?.timeOpen || existProductPrice?.timeOpen,

          timeClose:
            updatedProductPriceDto?.timeClose || existProductPrice?.timeClose,

          consumerType:
            updatedProductPriceDto?.consumerType ||
            existProductPrice?.consumerType,

          sellType:
            updatedProductPriceDto?.sellType || existProductPrice?.sellType,

          vendorDiscount:
            updatedProductPriceDto?.vendorDiscount ||
            existProductPrice?.vendorDiscount,

          vendorDiscountType:
            updatedProductPriceDto?.vendorDiscountType ||
            existProductPrice?.vendorDiscountType,

          consumerDiscount:
            updatedProductPriceDto?.consumerDiscount ||
            existProductPrice?.consumerDiscount,

          consumerDiscountType:
            updatedProductPriceDto?.consumerDiscountType ||
            existProductPrice?.consumerDiscountType,

          minQuantity:
            updatedProductPriceDto?.minQuantity ||
            existProductPrice?.minQuantity,

          maxQuantity:
            updatedProductPriceDto?.maxQuantity ||
            existProductPrice?.maxQuantity,

          productCondition:
            updatedProductPriceDto?.productCondition ||
            existProductPrice?.productCondition,

          minCustomer:
            updatedProductPriceDto?.minCustomer ||
            existProductPrice?.minCustomer,

          maxCustomer:
            updatedProductPriceDto?.maxCustomer ||
            existProductPrice?.maxCustomer,

          minQuantityPerCustomer:
            updatedProductPriceDto?.minQuantityPerCustomer ||
            existProductPrice?.minQuantityPerCustomer,

          maxQuantityPerCustomer:
            updatedProductPriceDto?.maxQuantityPerCustomer ||
            existProductPrice?.maxQuantityPerCustomer,

          status: updatedProductPriceDto?.status || existProductPrice?.status,
        },
      });

      // Get product details for notifications
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { productName: true },
      });

      // Check for stock changes and notify users with product in wishlist
      if (oldStock !== newStock && product) {
        try {
          // Get users who have this product in wishlist
          const wishlistUsers = await this.prisma.wishlist.findMany({
            where: {
              productId: productId,
              status: 'ACTIVE',
            },
            select: { userId: true },
            distinct: ['userId'],
          });

          for (const wishlistUser of wishlistUsers) {
            if (oldStock > 0 && newStock === 0) {
              // Out of stock
              await this.notificationService.createNotification({
                userId: wishlistUser.userId,
                type: 'STOCK',
                title: 'Product Out of Stock',
                message: `${product.productName} is now out of stock. We'll notify you when it's back!`,
                data: {
                  productId,
                  productPriceId,
                  productName: product.productName,
                  stockLevel: 0,
                  changeType: 'out_of_stock',
                },
                link: `/trending/${productId}`,
                icon: '📦',
              });
            } else if (oldStock === 0 && newStock > 0) {
              // Back in stock
              await this.notificationService.createNotification({
                userId: wishlistUser.userId,
                type: 'STOCK',
                title: 'Product Back in Stock',
                message: `Great news! ${product.productName} is back in stock. Order now!`,
                data: {
                  productId,
                  productPriceId,
                  productName: product.productName,
                  stockLevel: newStock,
                  changeType: 'back_in_stock',
                },
                link: `/trending/${productId}`,
                icon: '✅',
              });
            } else if (newStock > 0 && newStock <= 10 && oldStock > 10) {
              // Low stock
              await this.notificationService.createNotification({
                userId: wishlistUser.userId,
                type: 'STOCK',
                title: 'Low Stock Alert',
                message: `${product.productName} is running low on stock. Only ${newStock} left!`,
                data: {
                  productId,
                  productPriceId,
                  productName: product.productName,
                  stockLevel: newStock,
                  changeType: 'low_stock',
                },
                link: `/trending/${productId}`,
                icon: '⚠️',
              });
            }
          }
        } catch (notificationError) {
        }
      }

      // Check for price changes and notify users with product in wishlist
      if (oldOfferPrice !== newOfferPrice && product && oldOfferPrice > 0) {
        try {
          // Get users who have this product in wishlist
          const wishlistUsers = await this.prisma.wishlist.findMany({
            where: {
              productId: productId,
              status: 'ACTIVE',
            },
            select: { userId: true },
            distinct: ['userId'],
          });

          const isPriceDrop = newOfferPrice < oldOfferPrice;
          const title = isPriceDrop ? 'Price Drop!' : 'Price Changed';
          const message = isPriceDrop
            ? `Great news! The price of ${product.productName} has dropped to $${newOfferPrice}`
            : `The price of ${product.productName} has changed from $${oldOfferPrice} to $${newOfferPrice}`;
          const icon = isPriceDrop ? '💰' : '📊';

          for (const wishlistUser of wishlistUsers) {
            await this.notificationService.createNotification({
              userId: wishlistUser.userId,
              type: 'PRICE',
              title,
              message,
              data: {
                productId,
                productPriceId,
                productName: product.productName,
                oldPrice: oldOfferPrice,
                newPrice: newOfferPrice,
                currency: 'USD',
                isPriceDrop,
              },
              link: `/trending/${productId}`,
              icon,
            });
          }
        } catch (notificationError) {
        }
      }

      return {
        status: true,

        message: 'UpdatedSuccessfully',

        data: updatedProductPrice,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in updateProductPrice',

        error: getErrorMessage(error),
      };
    }
  }

  // Not in use

  /**
   * @method getOneProductPrice
   * @description Retrieves a single product-price record by primary key with includes
   *   for product, admin details, variants, geo regions, and seller images.
   *
   * @intent Fetch full details of one price listing for display or editing.
   *
   * @usage Called by `ProductController.getOneProductPrice()` via
   *   `GET /product/getOneProductPrice`.
   *
   * @dataflow productPriceId -> Prisma productPrice.findUnique() with deep includes
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} productPriceId - Primary key of the product-price record.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneProductPrice(productPriceId: any) {
    return this.productPricingService.getOneProductPrice(productPriceId);
    // --- Delegated to ProductPricingService ---
    try {
      // let productPriceID = productPriceId

      let productPriceID = parseInt(productPriceId);

      let getOneProductPrice = await this.prisma.productPrice.findUnique({
        where: { id: productPriceID },
      });

      if (!getOneProductPrice) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getOneProductPrice,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getOneProductPrice',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteOneProductPrice
   * @description Soft-deletes a single product-price record (status='DELETE', deletedAt=now).
   *
   * @intent Allow a seller to remove one of their price listings without hard-deleting.
   *
   * @usage Called by `ProductController.deleteOneProductPrice()` via
   *   `DELETE /product/deleteOneProductPrice`.
   *
   * @dataflow productPriceId -> Prisma productPrice.update({ status: 'DELETE', deletedAt })
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Uses the standard soft-delete pattern.
   *
   * @param {any} productPriceId - Primary key of the product-price record.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async deleteOneProductPrice(productPriceId: any) {
    return this.productPricingService.deleteOneProductPrice(productPriceId);
    // --- Delegated to ProductPricingService ---
    try {
      let productPriceID = parseInt(productPriceId);

      let getOneProductPrice = await this.prisma.productPrice.findUnique({
        where: { id: productPriceID },
      });

      if (!getOneProductPrice) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let deletedProductPrice = await this.prisma.productPrice.update({
        where: { id: productPriceID },

        data: {
          status: 'DELETE',

          deletedAt: new Date(),
        },
      });

      return {
        status: true,

        message: 'Deleted Successfully',

        data: deletedProductPrice,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in deleteOneProductPrice',

        error: getErrorMessage(error),
      };
    }
  }

  // ---- **** Product Price Ends

  /**
   * @method addCountry
   * @description Creates a new country record in the product-location reference data.
   *
   * @intent Populate the country master list for geo-sell-region assignment.
   *
   * @usage Called by `ProductController.addCountry()` via `POST /product/addCountry`.
   *
   * @dataflow payload (countryName) -> Prisma productCountry.create() -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Country data.
   * @param {any} req - Express request object.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addCountry(payload: any, req: any) {
    try {
      let addCountry = await this.prisma.countryList.create({
        data: {
          countryName: payload.countryName,
        },
      });

      return {
        status: false,

        message: 'error in addCountry',

        data: addCountry,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in addCountry',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method countryList
   * @description Retrieves all active country records.
   *
   * @intent Populate country dropdown selectors on the frontend.
   *
   * @usage Called by `ProductController.countryList()` via `GET /product/countryList`.
   *
   * @dataflow Prisma productCountry.findMany({ status: 'ACTIVE' }) -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async countryList() {
    try {
      let countryList = await this.prisma.countryList.findMany({
        where: { status: 'ACTIVE' },
        take: 300, // Safety cap for dropdown lists
      });

      if (!countryList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: countryList,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in countryList',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method addLocation
   * @description Creates a new location record in the product-location reference data.
   *
   * @intent Populate the location master list for product geographic assignments.
   *
   * @usage Called by `ProductController.addLocation()` via `POST /product/addLocation`.
   *
   * @dataflow payload (locationName) -> Prisma productLocation.create() -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Location data.
   * @param {any} req - Express request object.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addLocation(payload: any, req: any) {
    try {
      if (!payload?.locationName) {
        return {
          status: false,

          message: 'locationName is required',

          data: [],
        };
      }

      let addLocation = await this.prisma.locationList.create({
        data: {
          locationName: payload.locationName,
        },
      });

      return {
        status: false,

        message: 'error in addLocation',

        data: addLocation,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in addLocation',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method locationList
   * @description Retrieves all active location records.
   *
   * @intent Populate location dropdown selectors on the frontend.
   *
   * @usage Called by `ProductController.locationList()` via `GET /product/locationList`.
   *
   * @dataflow Prisma productLocation.findMany({ status: 'ACTIVE' }) -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async locationList() {
    try {
      let locationList = await this.prisma.locationList.findMany({
        where: { status: 'ACTIVE' },
        take: 500, // Safety cap for dropdown lists
      });

      if (!locationList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: locationList,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in locationList',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method productViewCount
   * @description Increments the view counter for a product.
   *
   * @intent Track product page impressions for popularity analytics.
   *
   * @usage Called by `ProductController.productViewCount()` via `PATCH /product/productViewCount`.
   *
   * @dataflow req.body.productId -> Prisma product.update({ viewCount: increment(1) })
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} req - Express request with body containing `productId`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async productViewCount(req: any) {
    return this.productMediaService.productViewCount(req);
    // --- Delegated to ProductMediaService ---
    try {
      const productId = req?.query?.productId;
      let userId = req?.user?.id;
      const deviceId = req?.query?.deviceId || req?.body?.deviceId;

      // Optionally extract userId from token if not already set (for endpoints without AuthGuard)
      if (!userId && req?.headers?.authorization) {
        try {
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const validationResult = await this.authService.validateToken(token);
            if (!validationResult.error && validationResult.user) {
              userId = validationResult.user.id;
            }
          }
        } catch (error) {
          // If token validation fails, continue without userId
        }
      }

      if (!productId) {
        return {
          status: false,
          message: 'productId is required',
          data: [],
        };
      }

      const productIdInt = parseInt(productId);

      // Update global view count
      await this.prisma.product.update({
        where: { id: productIdInt },
        data: {
          productViewCount: {
            increment: 1,
          },
        },
      });

      // Track individual user/device view
      // Always create a record - use deviceId as fallback if no userId
      const finalDeviceId = deviceId || (userId ? undefined : 'anonymous');
      
      if (userId || finalDeviceId) {
        const whereClause: any = {
          productId: productIdInt,
          deletedAt: null,
        };

        if (userId) {
          whereClause.userId = userId;
        } else if (finalDeviceId) {
          whereClause.deviceId = finalDeviceId;
        }

        const existingView = await this.prisma.productView.findFirst({
          where: whereClause,
        });

        if (existingView) {
          await this.prisma.productView.update({
            where: { id: existingView.id },
            data: {
              viewCount: { increment: 1 },
              lastViewedAt: new Date(),
            },
          });
        } else {
          await this.prisma.productView.create({
            data: {
              userId: userId || undefined,
              deviceId: finalDeviceId || undefined,
              productId: productIdInt,
              viewCount: 1,
              lastViewedAt: new Date(),
            },
          });
        }
      }

      return {
        status: true,
        message: 'Product view count updated successfully',
        data: [],
      };
    } catch (error) {

      return {
        status: false,
        message: 'error in productViewCount',
        error: getErrorMessage(error),
      };
    }
  }

  async trackProductClick(req: any, payload: { productId: number; clickSource?: string }) {
    return this.productMediaService.trackProductClick(req, payload);
    // --- Delegated to ProductMediaService ---
    try {
      const userId = req?.user?.id;
      const deviceId = req?.query?.deviceId || req?.body?.deviceId;

      if (!payload?.productId) {
        return {
          status: false,
          message: 'productId is required',
        };
      }

      await this.prisma.productClick.create({
        data: {
          userId: userId || undefined,
          deviceId: deviceId || undefined,
          productId: payload.productId,
          clickSource: payload.clickSource || 'unknown',
        },
      });

      return {
        status: true,
        message: 'Product click tracked successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in trackProductClick',
        error: getErrorMessage(error),
      };
    }
  }

  async trackProductSearch(req: any, payload: { searchTerm: string; productId?: number; clicked?: boolean }) {
    return this.productMediaService.trackProductSearch(req, payload);
    // --- Delegated to ProductMediaService ---
    try {
      const userId = req?.user?.id;
      const deviceId = req?.query?.deviceId || req?.body?.deviceId;

      if (!payload?.searchTerm) {
        return {
          status: false,
          message: 'searchTerm is required',
        };
      }

      await this.prisma.productSearch.create({
        data: {
          userId: userId || undefined,
          deviceId: deviceId || undefined,
          searchTerm: payload.searchTerm,
          productId: payload.productId || undefined,
          clicked: payload.clicked || false,
        },
      });

      return {
        status: true,
        message: 'Product search tracked successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in trackProductSearch',
        error: getErrorMessage(error),
      };
    }
  }

  // global product list

  /**
   * @method getAllProduct
   * @description Retrieves a paginated, sortable, filterable list of all marketplace
   *   products for the storefront.
   *
   * @intent Power the main storefront browse/search page with rich filtering.
   *
   * @usage Called by `ProductController.getAllProduct()` via `GET /product/getAllProduct`.
   *
   * @dataflow Query params -> dynamic where/orderBy construction -> Prisma product.findMany()
   *   with includes (category, brand, tags, images, reviews, prices)
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @notes
   *   - Supports sort keys: price_asc, price_desc, newest, etc.
   *   - Filters: brand, category, price range, userType (seller trade role).
   *   - Only ACTIVE products with at least one ACTIVE price entry are returned.
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request.
   * @param {any} term - Search term.
   * @param {any} sort - Sort key.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} priceMin - Minimum price filter.
   * @param {any} priceMax - Maximum price filter.
   * @param {any} userId - Optional user ID filter.
   * @param {any} categoryIds - Comma-separated category IDs.
   * @param {any} userType - Seller type filter.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllProduct(
    page: any,

    limit: any,

    req: any,

    term: any,

    sort: any,

    brandIds: any,

    priceMin: any,

    priceMax: any,

    userId: any,

    categoryIds: any,

    userType: any,
  ) {
    return this.productSearchService.getAllProduct(page, limit, req, term, sort, brandIds, priceMin, priceMax, userId, categoryIds, userType);
  }


  /**
   * @method getAllProductByUserBusinessCategory
   * @description Retrieves products matching the authenticated user's business category tags.
   *
   * @intent Show personalised product recommendations based on the seller's business profile.
   *
   * @usage Called by `ProductController.getAllProductByUserBusinessCategory()` via
   *   `GET /product/getAllProductByUserBusinessCategory`.
   *
   * @dataflow req.user.id -> user profile + business type tags lookup
   *   -> category-matched product query -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getAllProductByUserBusinessCategory(req: any) {
    return this.productSearchService.getAllProductByUserBusinessCategory(req);
    // --- Delegated to ProductSearchService --- Original code below is unreachable ---
    try {
      // Handle both user object structures (from User model or custom object)

      let userId = req.user.id || req.user.userId;

      let admin_id = userId;

      admin_id = await this.helperService.getAdminId(admin_id);


      userId = parseInt(admin_id);


      const userBusinesCategoryDetail =
        await this.prisma.userBusinessCategory.findMany({
          where: {
            userId: userId,

            status: 'ACTIVE',
          },
        });

      // return {

      //   status: true,

      //   message: 'Fetch Successfully',

      //   data: userBusinesCategoryDetail,

      //   userId: userId

      // }

      const businessCategoryIds = [
        ...new Set(
          userBusinesCategoryDetail.map((category) => category.categoryId),
        ),
      ];

      let category = await this.prisma.categoryConnectTo.findMany({
        where: { connectTo: { in: businessCategoryIds } },
      });

      const categoryIdsFromConnectTo = category.map((item) => item.categoryId);

      let connectTo = await this.prisma.categoryConnectTo.findMany({
        where: { categoryId: { in: businessCategoryIds } },
      });

      const categoryIdsFromCategory = connectTo.map((item) => item.connectTo);

      const productCategoryIds = [
        ...new Set([
          ...categoryIdsFromConnectTo.filter(Boolean),

          ...categoryIdsFromCategory.filter(Boolean),
        ]),
      ];

      let Page = parseInt(req.query.page) || 1;

      let pageSize = parseInt(req.query.limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = req.query.term?.length > 2 ? req.query.term : '';

      const sortType = req.query.sort ? req.query.sort : 'desc';

      const userID = parseInt(userId);

      let myProduct;

      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      let whereCondition: any = {
        productType: {
          in: ['P', 'F'],
        },

        status: 'ACTIVE',

        categoryId: productCategoryIds
          ? {
              in: productCategoryIds,
            }
          : undefined,

        brandId: req.query.brandIds
          ? {
              in: req.query.brandIds

                .split(',')

                .map((id) => parseInt(id.trim())),
            }
          : undefined,

        product_productPrice: {
          some: {
            askForPrice: 'false',

            isCustomProduct: 'false',

            sellType: 'NORMALSELL',

            status: 'ACTIVE',
          },
        },

        adminId: myProduct,

        OR: searchTerm
          ? [
              {
                productName: {
                  contains: searchTerm,

                  mode: 'insensitive',
                },
              },

              {
                brand: {
                  brandName: {
                    contains: searchTerm,

                    mode: 'insensitive',
                  },
                },
              },
            ]
          : undefined,
      };

      if (req.query.priceMin && req.query.priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(req.query.priceMin),

          lte: parseFloat(req.query.priceMax),
        };
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,

        include: {
          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_wishlist: {
            where: { userId: userID },

            select: {
              userId: true,

              productId: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',

              // askForPrice: 'false',

              // askForStock: 'false'
            },

            include: {
              productPrice_productSellerImage: true,

              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),

            0,
          );

          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0; // Set default value if no reviews
        }
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        categoryIdsFromConnectTo: categoryIdsFromConnectTo,

        categoryIdsFromCategory: categoryIdsFromCategory,

        businessCategoryIds: businessCategoryIds,

        productCategoryIds: productCategoryIds,

        data: productDetailList,

        totalCount: productDetailListCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in getAllProductByUserBusinessCategory',

        error: getErrorMessage(error),
      };
    }
  }

  // existingAllProduct  list

  /**
   * @method existingAllProduct
   * @description Retrieves a paginated list of existing catalogue products with advanced
   *   filters, scoped by the brand's original creator.
   *
   * @intent Allow sellers to browse the existing catalogue to add their own prices.
   *
   * @usage Called by `ProductController.existingAllProduct()` via `GET /product/existingAllProduct`.
   *
   * @dataflow Query params + brandAddedBy -> Prisma product.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request.
   * @param {any} term - Search term.
   * @param {any} sort - Sort key.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} priceMin - Minimum price filter.
   * @param {any} priceMax - Maximum price filter.
   * @param {any} userId - Optional user ID.
   * @param {any} categoryIds - Comma-separated category IDs.
   * @param {any} brandAddedBy - User ID of the brand's original creator.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async existingAllProduct(
    page: any,

    limit: any,

    req: any,

    term: any,

    sort: any,

    brandIds: any,

    priceMin: any,

    priceMax: any,

    userId: any,

    categoryIds: any,

    brandAddedBy: any,
  ) {
    return this.productSearchService.existingAllProduct(page, limit, req, term, sort, brandIds, priceMin, priceMax, userId, categoryIds, brandAddedBy);
    // --- Delegated to ProductSearchService ---
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const sortType = sort ? sort : 'desc';

      const userID = parseInt(userId);

      const brandAddedBY = parseInt(brandAddedBy);

      // Parse categoryIds string into an array of integers

      // const categoryIdsArray = categoryIds.split(',').map((id: string) => parseInt(id.trim()));

      let whereCondition: any = {
        productType: 'P',

        status: 'ACTIVE',

        productName: {
          contains: searchTerm,

          mode: 'insensitive',
        },

        categoryId: categoryIds
          ? {
              in: categoryIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,

        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,

        brand: {
          brandType: 'ADMIN',

          // addedBy: { not: brandAddedBY } // Exclude products where the brand's addedBy does not match addedBY
        },
      };

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin),

          lte: parseFloat(priceMax),
        };
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,

        include: {
          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_wishlist: {
            where: { userId: userID },

            select: {
              userId: true,

              productId: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productPrice_productSellerImage: true,

              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),

            0,
          );

          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0; // Set default value if no reviews
        }
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetailList,

        totalCount: productDetailListCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in getAllProduct',

        error: getErrorMessage(error),
      };
    }
  }

  // relatedProduct list for global

  /**
   * @method relatedAllProduct
   * @description Retrieves products related by shared tags, excluding the current product.
   *
   * @intent Power the "Related Products" recommendation section on the PDP.
   *
   * @usage Called by `ProductController.relatedAllProduct()` via `GET /product/relatedAllProduct`.
   *
   * @dataflow tagIds + productId exclusion -> Prisma product.findMany() via productTags join
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} tagIds - Comma-separated tag IDs to match.
   * @param {any} userId - Optional user ID for wishlist detection.
   * @param {any} productId - Product ID to exclude.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async relatedAllProduct(
    page: any,

    limit: any,

    tagIds: any,

    userId: any,

    productId: any,
  ) {
    return this.productSearchService.relatedAllProduct(page, limit, tagIds, userId, productId);
    // --- Delegated to ProductSearchService ---
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      const sortType = 'desc';

      const userID = parseInt(userId);

      const productID = parseInt(productId);

      if (!productID) {
        return {
          status: false,

          message: 'productId is required!',

          data: [],

          totalCount: 0,
        };
      }

      // Parse tagIds string into an array of integers

      const tagIdsArray = tagIds

        .split(',')

        .map((id: string) => parseInt(id.trim()));

      let whereCondition: any = {
        id: {
          not: productID,
        },

        productType: 'P',

        status: 'ACTIVE',

        productTags: {
          some: {
            tagId: {
              in: tagIdsArray,
            },
          },
        },
      };

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,

        include: {
          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_wishlist: {
            where: { userId: userID },

            select: {
              userId: true,

              productId: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',

              // askForPrice: 'false',

              // askForStock: 'false'
            },

            include: {
              productPrice_productSellerImage: true,

              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),

            0,
          );

          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0; // Set default value if no reviews
        }
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetailList,

        totalCount: productDetailListCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in relatedAllProduct',

        error: getErrorMessage(error),
      };
    }
  }

  // sameBrand Product list for global

  /**
   * @method sameBrandAllProduct
   * @description Retrieves products sharing the same brand, excluding the current product.
   *
   * @intent Power the "More from this brand" recommendation section on the PDP.
   *
   * @usage Called by `ProductController.sameBrandAllProduct()` via `GET /product/sameBrandAllProduct`.
   *
   * @dataflow brandIds + productId exclusion -> Prisma product.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} userId - Optional user ID for wishlist detection.
   * @param {any} productId - Product ID to exclude.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async sameBrandAllProduct(
    page: any,

    limit: any,

    req: any,

    brandIds: any,

    userId: any,

    productId: any,
  ) {
    return this.productSearchService.sameBrandAllProduct(page, limit, req, brandIds, userId, productId);
    // --- Delegated to ProductSearchService ---
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      const sortType = 'desc';

      const userID = parseInt(userId);

      const productID = parseInt(productId);

      if (!productID) {
        return {
          status: false,

          message: 'productId is required!',

          data: [],

          totalCount: 0,
        };
      }

      let whereCondition: any = {
        id: {
          not: productID,
        },

        productType: 'P',

        status: 'ACTIVE',

        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
      };

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,

        include: {
          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_wishlist: {
            where: { userId: userID },

            select: {
              userId: true,

              productId: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',

              // askForPrice: 'false',

              // askForStock: 'false'
            },

            include: {
              productPrice_productSellerImage: true,

              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),

            0,
          );

          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0; // Set default value if no reviews
        }
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: productDetailList,

        totalCount: productDetailListCount,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in sameBrandAllProduct',

        error: getErrorMessage(error),
      };
    }
  }

  // Review Product by user

  /**
   * @method addProductReview
   * @description Creates a new product review (rating + text) by an authenticated user.
   *
   * @intent Allow buyers to rate and review products.
   *
   * @usage Called by `ProductController.addProductReview()` via `POST /product/addProductReview`.
   *
   * @dataflow payload (productId, rating, review) + req.user.id
   *   -> Prisma productReview.create() -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Review data (productId, rating, review text).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addProductReview(payload: any, req: any) {
    try {
      const productId = payload?.productId;

      const userId = req?.user?.id;

      let addProductReview = await this.prisma.productReview.create({
        data: {
          userId: userId,

          productId: productId,

          title: payload?.title,

          description: payload?.description,

          rating: payload?.rating,
        },
      });

      // Get product details and vendor info for notification
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: {
            productName: true,
            product_productPrice: {
              where: { status: 'ACTIVE' },
              take: 1,
              select: {
                adminId: true,
                adminDetail: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

        if (product && product.product_productPrice.length > 0) {
          const vendorId = product.product_productPrice[0].adminDetail?.id;
          if (vendorId) {
            await this.notificationService.createNotification({
              userId: vendorId,
              type: 'REVIEW',
              title: 'New Review',
              message: `You have received a new review for ${product.productName}`,
              data: {
                productId,
                reviewId: addProductReview.id,
                productName: product.productName,
              },
              link: `/trending/${productId}#reviews`,
              icon: '⭐',
            });
          }
        }
      } catch (notificationError) {
      }

      return {
        status: true,

        message: 'Created Successfully',

        data: addProductReview,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in addProductReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method editProductReview
   * @description Updates an existing product review.
   *
   * @intent Allow buyers to modify their previously submitted review.
   *
   * @usage Called by `ProductController.editProductReview()` via `PATCH /product/editProductReview`.
   *
   * @dataflow payload (productReviewId, updated fields) -> Prisma productReview.update()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Updated review data with productReviewId.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async editProductReview(payload: any, req: any) {
    try {
      if (!payload?.productReviewId) {
        return {
          status: false,

          message: 'productReviewId cannot be empty',

          data: [],
        };
      }

      const productReviewId = payload?.productReviewId;

      let existOneProductReview = await this.prisma.productReview.findUnique({
        where: { id: productReviewId },
      });

      if (!existOneProductReview) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let editProductReview = await this.prisma.productReview.update({
        where: { id: productReviewId },

        data: {
          title: payload?.title,

          description: payload?.description,

          rating: payload?.rating,
        },
      });

      return {
        status: true,

        message: 'Updated Successfully',

        data: editProductReview,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in editProductReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneProductReview
   * @description Retrieves a single product review by primary key with user details.
   *
   * @intent Fetch full review details for display or editing.
   *
   * @usage Called by `ProductController.getOneProductReview()` via `GET /product/getOneProductReview`.
   *
   * @dataflow productReviewId -> Prisma productReview.findUnique() with user include
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} productReviewId - Primary key of the review.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneProductReview(productReviewId: any) {
    try {
      if (!productReviewId) {
        return {
          status: false,

          message: 'productReviewId cannot be empty',

          data: [],
        };
      }

      const productReviewID = parseInt(productReviewId);

      let getOneProductReview = await this.prisma.productReview.findUnique({
        where: { id: productReviewID },
      });

      if (!getOneProductReview) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getOneProductReview,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getOneProductReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllProductReview
   * @description Retrieves a paginated, sortable list of reviews for a specific product.
   *
   * @intent Power the product review section on the PDP.
   *
   * @usage Called by `ProductController.getAllProductReview()` via `GET /product/getAllProductReview`.
   *
   * @dataflow productId + pagination/sort -> Prisma productReview.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} productId - Product to fetch reviews for.
   * @param {any} sortType - Sort order (newest, highest, lowest).
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllProductReview(
    page: any,

    limit: any,

    productId: any,

    sortType: any,
  ) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let productID = parseInt(productId);

      let sort = {};

      if (sortType == 'highest') {
        sort = { rating: 'desc' };
      } else if (sortType == 'lowest') {
        sort = { rating: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let getAllProductReview = await this.prisma.productReview.findMany({
        where: {
          productId: productID,

          status: 'ACTIVE',
        },

        include: {
          reviewByUserDetail: {
            select: {
              firstName: true,
              lastName: true,
              accountName: true,
              profilePicture: true,
            },
          },
        },

        orderBy: sort,

        skip, // Offset

        take: pageSize, // Limit
      });

      let getAllProductReviewCount = await this.prisma.productReview.count({
        where: {
          productId: productID,

          status: 'ACTIVE',
        },
      });

      if (!getAllProductReview) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllProductReview,

        totalcount: getAllProductReviewCount,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in getAllProductReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllProductReviewBySellerId
   * @description Retrieves all product reviews for products owned by the authenticated seller.
   *
   * @intent Power the seller's review management dashboard.
   *
   * @usage Called by `ProductController.getAllProductReviewBySellerId()` via
   *   `GET /product/getAllProductReviewBySellerId`.
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma productReview.findMany()
   *   where product.adminId matches -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with user.
   * @param {any} sortType - Sort order.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllProductReviewBySellerId(
    page: any,

    limit: any,

    req: any,

    sortType: any,
  ) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      const sellerId = req?.user?.id;

      let sort = {};

      if (sortType == 'highest') {
        sort = { rating: 'desc' };
      } else if (sortType == 'lowest') {
        sort = { rating: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let getAllProductReview = await this.prisma.productReview.findMany({
        where: {
          status: 'ACTIVE',

          productReview_product: {
            userId: sellerId,
          },
        },

        include: {
          productReview_product: {
            include: {
              productImages: true,
            },
          },

          reviewByUserDetail: {
            select: { firstName: true, lastName: true, profilePicture: true },
          },
        },

        orderBy: sort,

        skip, // Offset

        take: pageSize, // Limit
      });

      if (!getAllProductReview) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      let getAllProductReviewCount = await this.prisma.productReview.count({
        where: {
          status: 'ACTIVE',

          productReview_product: {
            userId: sellerId,
          },
        },
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllProductReview,

        totalcount: getAllProductReviewCount,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getAllProductReviewBySellerId',
      };
    }
  }

  // START Review Product Price By User

  /**
   * @method addProductPriceReview
   * @description Creates a review for a specific seller's product-price entry.
   *
   * @intent Allow buyers to rate individual seller listings (seller-level review).
   *
   * @usage Called by `ProductController.addProductPriceReview()` via
   *   `POST /product/addProductPriceReview`.
   *
   * @dataflow payload (productPriceId, rating, review) + req.user.id
   *   -> Prisma productPriceReview.create() -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Review data targeting a productPriceId.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addProductPriceReview(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      let addProductPriceReview = await this.prisma.productPriceReview.create({
        data: {
          userId: userId,

          productPriceId: payload?.productPriceId,

          adminId: payload?.adminId,

          productId: payload?.productId,

          title: payload?.title,

          description: payload?.description,

          rating: payload?.rating,
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: addProductPriceReview,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in addProductPriceReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneProductPriceReview
   * @description Retrieves a single product-price review by primary key.
   *
   * @intent Fetch full details of a seller-specific review.
   *
   * @usage Called by `ProductController.getOneProductPriceReview()` via
   *   `GET /product/getOneProductPriceReview`.
   *
   * @dataflow productPriceReviewId -> Prisma productPriceReview.findUnique()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} productPriceReviewId - Primary key of the price review.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneProductPriceReview(productPriceReviewId: any) {
    try {
      const productPriceReviewID = parseInt(productPriceReviewId);

      if (!productPriceReviewID) {
        return {
          status: false,

          message: 'productPriceReviewId is required',

          data: [],
        };
      }

      let existProductPriceReview = await this.prisma.productPriceReview.findUnique({
        where: { id: productPriceReviewID },
      });

      if (!existProductPriceReview) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: existProductPriceReview,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in getOneProductPriceReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateOneProductPriceReview
   * @description Updates an existing product-price review.
   *
   * @intent Allow buyers to modify their seller-specific review.
   *
   * @usage Called by `ProductController.updateOneProductPriceReview()` via
   *   `PATCH /product/updateOneProductPriceReview`.
   *
   * @dataflow payload (productPriceReviewId, updated fields) -> Prisma productPriceReview.update()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Updated review data with productPriceReviewId.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateOneProductPriceReview(payload: any, req: any) {
    try {
      const productPriceReviewID = payload?.productPriceReviewId;

      if (!productPriceReviewID) {
        return {
          status: false,

          message: 'productPriceReviewId is required',

          data: [],
        };
      }

      let existProductPriceReview = await this.prisma.productPriceReview.findUnique({
        where: { id: productPriceReviewID },
      });

      if (!existProductPriceReview) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let updatedProductPriceReview = await this.prisma.productPriceReview.update({
        where: { id: productPriceReviewID },

        data: {
          title: payload?.title || existProductPriceReview?.title,

          description: payload?.description || existProductPriceReview?.title,

          rating: payload?.rating || existProductPriceReview?.title,
        },
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: updatedProductPriceReview,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in getOneProductPriceReview',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllProductPriceReviewBySellerId
   * @description Retrieves all product-price reviews for a specific seller with pagination and sorting.
   *
   * @intent Power the seller's price-level review dashboard.
   *
   * @usage Called by `ProductController.getAllProductPriceReviewBySellerId()` via
   *   `GET /product/getAllProductPriceReviewBySellerId`.
   *
   * @dataflow sellerId + pagination/sort -> Prisma productPriceReview.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} sellerId - Seller user ID.
   * @param {any} sortType - Sort order.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllProductPriceReviewBySellerId(
    page: any,

    limit: any,

    sellerId: any,

    sortType: any,
  ) {
    try {
      const sellerID = parseInt(sellerId);

      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let sort = {};

      if (sortType == 'highest') {
        sort = { rating: 'desc' };
      } else if (sortType == 'lowest') {
        sort = { rating: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let whereCondition: any = {
        status: { in: ['ACTIVE'] },

        adminId: sellerID,

        // productPriceReview_productPrice: {

        //   some: {

        //     adminId: sellerID

        //   }

        // }
      };

      let getAllProductPriceReviewBySellerId =
        await this.prisma.productPriceReview.findMany({
          where: whereCondition,

          orderBy: sort,

          skip, // Offset

          take: pageSize, // Limit
        });

      let getAllProductPriceReviewBySellerIdCount =
        await this.prisma.productPriceReview.count({
          where: whereCondition,
        });

      if (!getAllProductPriceReviewBySellerId) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllProductPriceReviewBySellerId,

        totalCount: getAllProductPriceReviewBySellerIdCount,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in getAllProductPriceReviewBySellerId',

        error: getErrorMessage(error),
      };
    }
  }

  // END Review Product Price By User

  /**
   * @method askQuestion
   * @description Creates a new question on a product listing.
   *
   * @intent Allow authenticated buyers to ask questions about a product.
   *
   * @usage Called by `ProductController.askQuestion()` via `POST /product/askQuestion`.
   *
   * @dataflow payload (productId, question) + req.user.id -> Prisma productQuestion.create()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Question data (productId, question text).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async askQuestion(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      const productId = payload?.productId;

      let askQuestion = await this.prisma.productQuestion.create({
        data: {
          productId: productId,

          question: payload?.question,

          questionByuserId: userId,

          questionType: 'PRODUCT',
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: askQuestion,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in askQuestion',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllQuestion
   * @description Retrieves a paginated, sortable list of questions for a product,
   *   with optional userType filtering and answer inclusion.
   *
   * @intent Power the Q&A section on the product detail page.
   *
   * @usage Called by `ProductController.getAllQuestion()` via `GET /product/getAllQuestion`.
   *
   * @dataflow productId + pagination/sort/userType -> Prisma productQuestion.findMany()
   *   with answer includes -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} productId - Product to fetch questions for.
   * @param {any} sortType - Sort order.
   * @param {any} userType - Optional user type filter.
   * @param {any} req - Express request.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllQuestion(
    page: any,

    limit: any,

    productId: any,

    sortType: any,

    userType: any,

    req: any,
  ) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let productID = parseInt(productId);

      let sort = {};

      if (sortType == 'oldest') {
        sort = { createdAt: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let tradeRole;

      if (userType === 'VENDOR') {
        //  VENDOR

        tradeRole = ['COMPANY', 'FREELANCER'];
      } else if (userType === 'CUSTOMER') {
        // CUSTOMER

        tradeRole = ['BUYER'];
      } else {
        // For All

        tradeRole = ['COMPANY', 'FREELANCER', 'BUYER'];
      }

      let whereCondition: any = {
        productId: productID,

        status: 'ACTIVE',

        questionByuserIdDetail: {
          tradeRole: { in: tradeRole }, // Move filtering inside the relation
        },

        questionType: 'PRODUCT',
      };

      let getAllQuestion = await this.prisma.productQuestion.findMany({
        where: whereCondition,

        include: {
          questionByuserIdDetail: {
            select: {
              id: true,

              firstName: true,

              lastName: true,

              profilePicture: true,

              tradeRole: true,
            },
          },

          productQuestionAnswerDetail: {
            include: {
              answerByUserDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  profilePicture: true,
                },
              },
            },
          },
        },

        orderBy: sort,

        skip, // Offset

        take: pageSize, // Limit
      });

      let getAllQuestionCount = await this.prisma.productQuestion.count({
        where: whereCondition,
      });

      if (!getAllQuestion) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllQuestion,

        totalcount: getAllQuestionCount,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in getAllQuestion',

        error: getErrorMessage(error),
      };
    }
  }

  // old method

  /**
   * @method giveAnswer_old
   * @description Legacy implementation of answer submission for product questions.
   *
   * @intent Historical method -- superseded by `giveAnswer()`.
   *
   * @usage Not currently called from any controller endpoint.
   *
   * @dataflow payload (productQuestionId, answer) -> Prisma productQuestion.update()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Kept for reference; the active implementation is `giveAnswer()`.
   *
   * @param {any} payload - Answer data (productQuestionId, answer text).
   * @param {any} req - Express request.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async giveAnswer_old(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      const productQuestionId = payload?.productQuestionId;

      let existQuestion = await this.prisma.productQuestion.findUnique({
        where: { id: productQuestionId },
      });

      if (!existQuestion) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let giveAnswer = await this.prisma.productQuestion.update({
        where: { id: productQuestionId },

        data: {
          answer: payload?.answer,

          answerByuserId: userId,
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: giveAnswer,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in giveAnswer',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method giveAnswer
   * @description Adds or updates an answer to an existing product question.
   *
   * @intent Allow sellers or other users to answer questions posted on a product.
   *
   * @usage Called by `ProductController.giveAnswer()` via `PATCH /product/giveAnswer`.
   *
   * @dataflow payload (productQuestionId, answer) -> Prisma productQuestion.update()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Answer data (productQuestionId, answer text).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async giveAnswer(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      const productQuestionId = payload?.productQuestionId;

      let giveAnswer = await this.prisma.productQuestionAnswer.create({
        data: {
          productId: payload?.productId,

          productQuestionId: productQuestionId,

          answer: payload?.answer,

          answerByuserId: userId,

          questionType: 'PRODUCT',
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: giveAnswer,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error in giveAnswer',

        error: getErrorMessage(error),
      };
    }
  }

  // RFQ Products

  // No More in use

  /**
   * @method addRfqProduct
   * @description Creates a new RFQ product listing with tags and images.
   *
   * @intent Allow buyers to submit a Request For Quotation for a product they need.
   *
   * @usage Called by `ProductController.addRfqProduct()` via `POST /product/addRfqProduct`.
   *
   * @dataflow payload -> Prisma rfqProduct.create() + tags/images -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} payload - RFQ product data.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addRfqProduct(payload: any, req: any) {
    return this.productRfqService.addRfqProduct(payload, req);
  }

  // No More in use

  /**
   * @method editRfqProduct
   * @description Updates an existing RFQ product listing including tags and images.
   *
   * @intent Allow the RFQ creator to modify their request.
   *
   * @usage Called by `ProductController.editRfqProduct()` via `PATCH /product/editRfqProduct`.
   *
   * @dataflow payload (rfqProductId + updates) -> Prisma rfqProduct.update()
   *   + delete-and-recreate tags/images -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Updated RFQ product data.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async editRfqProduct(payload: any, req: any) {
    return this.productRfqService.editRfqProduct(payload, req);
  }

  // No More in use

  /**
   * @method getOneRfqProduct
   * @description Retrieves a single RFQ product by primary key with full includes.
   *
   * @intent Power the RFQ product detail page.
   *
   * @usage Called by `ProductController.getOneRfqProduct()` via `GET /product/getOneRfqProduct`.
   *
   * @dataflow rfqProductId -> Prisma rfqProduct.findUnique() with deep includes
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} rfqProductId - Primary key of the RFQ product.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneRfqProduct(rfqProductId: any) {
    return this.productRfqService.getOneRfqProduct(rfqProductId);
  }

  /**

   * --------- RFQ Product Listing

   */

  // In Use

  /**
   * @method getAllRfqProduct
   * @description Retrieves a paginated list of RFQ products with search, brand, admin,
   *   and sort filtering.
   *
   * @intent Power the RFQ product listing dashboard.
   *
   * @usage Called by `ProductController.getAllRfqProduct()` via `GET /product/getAllRfqProduct`.
   *
   * @dataflow Query params -> Prisma product.findMany() filtered by productType='R' (RFQ)
   *   -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} term - Search term.
   * @param {any} adminId - Admin/seller ID filter.
   * @param {any} sortType - Sort order.
   * @param {any} req - Express request.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllRfqProduct(
    page: any,
    limit: any,
    term: any,
    adminId: any,
    sortType: any,
    req: any,
    brandIds: any,
  ) {
    return this.productRfqService.getAllRfqProduct(page, limit, term, adminId, sortType, req, brandIds);
  }

  /**
   * @method rfqFindOne
   * @description Retrieves a single RFQ-type product with seller, wishlist, and review info.
   *
   * @intent Power the RFQ product detail page for public viewers.
   *
   * @usage Called by `ProductController.rfqFindOne()` via `GET /product/rfqFindOne`.
   *
   * @dataflow productId -> Prisma product.findUnique() with RFQ-specific includes
   *   -> wishlist check -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} productId - Product primary key.
   * @param {any} req - Express request.
   * @param {any} userId - Optional viewer user ID for wishlist detection.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async rfqFindOne(productId: any, req: any, userId: any) {
    return this.productRfqService.rfqFindOne(productId, req, userId);
  }

  /**
   * @method addProductDuplicateRfq
   * @description Duplicates an existing product into the RFQ system.
   *
   * @intent Quickly create an RFQ listing from an existing product.
   *
   * @usage Called by `ProductController.addProductDuplicateRfq()` via
   *   `POST /product/addProductDuplicateRfq`.
   *
   * @dataflow payload (productId) -> copy product data -> Prisma rfqProduct.create()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Source product reference (productId).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addProductDuplicateRfq(payload: any, req: any) {
    return this.productRfqService.addProductDuplicateRfq(payload, req);
  }

  // testing purpose api

  /**
   * @method allCompanyFreelancer
   * @description Retrieves all company and freelancer users matching specific criteria
   *   for RFQ quote distribution.
   *
   * @intent List potential sellers/freelancers for sending RFQ quotes.
   *
   * @usage Called by `ProductController.allCompanyFreelancer()` via
   *   `POST /product/allCompanyFreelancer`.
   *
   * @dataflow payload (filter criteria) -> Prisma user.findMany() with profile includes
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} payload - Filter criteria for company/freelancer lookup.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async allCompanyFreelancer(payload: any, req: any) {
    return this.productRfqService.allCompanyFreelancer(payload, req);
  }

  /**
   * Get vendors matching location criteria
   * Priority: UserBranch > UserAddress (main) > UserAddress (subaccounts)
   *
   * @param countryId - Country ID (optional)
   * @param stateId - State ID (optional)
   * @param cityId - City ID (optional)
   * @param excludeUserId - User ID to exclude from results
   * @returns Array of vendor user IDs
   */
  async getVendorsByLocation(
    countryId?: number,
    stateId?: number,
    cityId?: number,
    excludeUserId?: number,
  ): Promise<number[]> {
    return this.productRfqService.getVendorsByLocation(countryId, stateId, cityId, excludeUserId);
  }

  /**
   * @method addRfqQuotes
   * @description Creates RFQ quote requests targeting specific sellers for a product,
   *   and dispatches notifications to each targeted seller.
   *
   * @intent Allow buyers to send quote requests to multiple sellers.
   *
   * @usage Called by `ProductController.addRfqQuotes()` via `POST /product/addRfqQuotes`.
   *
   * @dataflow payload (rfqProductId, seller list) -> Prisma rfqQuotes.create()
   *   + rfqQuotesUser.create() per seller + NotificationService dispatch
   *   -> { status, message, data }
   *
   * @dependencies HelperService, NotificationService, PrismaClient
   *
   * @param {any} payload - Quote request data (rfqProductId, targeted sellers).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addRfqQuotes(payload: any, req: any) {
    return this.productRfqService.addRfqQuotes(payload, req);
  }

  /**
   * @method getAllRfqQuotesByBuyerID
   * @description Retrieves all RFQ quotes created by the authenticated buyer, paginated.
   *
   * @intent Power the buyer's "My RFQ Quotes" dashboard.
   *
   * @usage Called by `ProductController.getAllRfqQuotesByBuyerID()` via
   *   `GET /product/getAllRfqQuotesByBuyerID`.
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma rfqQuotes.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllRfqQuotesByBuyerID(page: any, limit: any, req: any) {
    return this.productRfqService.getAllRfqQuotesByBuyerID(page, limit, req);
  }

  /**
   * @method deleteOneRfqQuote
   * @description Soft-deletes a single RFQ quote (status='DELETE', deletedAt=now).
   *
   * @intent Allow buyers to remove an RFQ quote they no longer need.
   *
   * @usage Called by `ProductController.deleteOneRfqQuote()` via
   *   `DELETE /product/deleteOneRfqQuote`.
   *
   * @dataflow rfqQuotesId -> Prisma rfqQuotes.update({ status: 'DELETE', deletedAt })
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} rfqQuotesId - Primary key of the RFQ quote.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async deleteOneRfqQuote(rfqQuotesId: any, req: any) {
    return this.productRfqService.deleteOneRfqQuote(rfqQuotesId, req);
  }

  /**
   * @method getAllRfqQuotesUsersByBuyerID
   * @description Retrieves all sellers who received a specific RFQ quote from the buyer.
   *
   * @intent Show the buyer which sellers were targeted and their response status.
   *
   * @usage Called by `ProductController.getAllRfqQuotesUsersByBuyerID()` via
   *   `GET /product/getAllRfqQuotesUsersByBuyerID`.
   *
   * @dataflow rfqQuotesId + req.user.id -> Prisma rfqQuotesUser.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with `user.id` from JWT.
   * @param {any} rfqQuotesId - Primary key of the RFQ quote.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllRfqQuotesUsersByBuyerID(
    page: any,

    limit: any,

    req: any,

    rfqQuotesId: any,
  ) {
    return this.productRfqService.getAllRfqQuotesUsersByBuyerID(page, limit, req, rfqQuotesId);
  }

  /**
   * @method getOneRfqQuotesUsersByBuyerID
   * @description Retrieves a single RFQ quote user record (seller response) for a buyer.
   *
   * @intent Show detailed seller response for a specific RFQ quote.
   *
   * @usage Called by `ProductController.getOneRfqQuotesUsersByBuyerID()` via
   *   `GET /product/getOneRfqQuotesUsersByBuyerID`.
   *
   * @dataflow rfqQuotesId + req.user.id -> Prisma rfqQuotesUser.findFirst()
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @param {any} req - Express request with `user.id` from JWT.
   * @param {any} rfqQuotesId - Primary key of the RFQ quote.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneRfqQuotesUsersByBuyerID(req: any, rfqQuotesId: any) {
    return this.productRfqService.getOneRfqQuotesUsersByBuyerID(req, rfqQuotesId);
  }

  /**
   * @method getAllRfqQuotesUsersBySellerID
   * @description Retrieves all RFQ quote requests received by the authenticated seller.
   *
   * @intent Power the seller's "Incoming RFQ Quotes" dashboard.
   *
   * @usage Called by `ProductController.getAllRfqQuotesUsersBySellerID()` via
   *   `GET /product/getAllRfqQuotesUsersBySellerID`.
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma rfqQuotesUser.findMany()
   *   where sellerId matches -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with `user.id` from JWT.
   * @param {boolean} showHidden - Whether to show hidden RFQ quotes.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllRfqQuotesUsersBySellerID(page: any, limit: any, req: any, showHidden: boolean = false) {
    return this.productRfqService.getAllRfqQuotesUsersBySellerID(page, limit, req, showHidden);
  }

  async hideRfqRequest(rfqQuotesUserId: number, isHidden: boolean, req: any) {
    return this.productRfqService.hideRfqRequest(rfqQuotesUserId, isHidden, req);
  }

  // ---- **** CUSTOM FIELD FOR PRODUCT BEGINS **** ----

  /**
   * @method createCustomFieldValue
   * @description Creates or updates custom field values for a product-price entry.
   *
   * @intent Allow sellers to attach dynamic form field answers to their price listings.
   *
   * @usage Called by `ProductController.createCustomFieldValue()` via
   *   `POST /product/createCustomFieldValue`.
   *
   * @dataflow payload (productPriceId, field values) -> loop -> Prisma customFieldValue upserts
   *   -> { status, message, data }
   *
   * @dependencies PrismaClient
   *
   * @notes Custom fields are category-driven via the dynamicFormCategory schema.
   *
   * @param {any} payload - Custom field data (productPriceId, field ID-value pairs).
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async createCustomFieldValue(payload: any, req: any) {
    return this.productRfqService.createCustomFieldValue(payload, req);
  }

  /* ----------------------------------------------------------- Factories Product -------------------------------------------------------  */

  // general Factories product listing

  /**
   * @method getAllFactoriesProduct
   * @description Retrieves a paginated list of factories-type products (menuId=10)
   *   with search, brand, admin, sort, and userType filtering.
   *
   * @intent Power the Factories product listing page.
   *
   * @usage Called by `ProductController.getAllFactoriesProduct()` via
   *   `GET /product/getAllFactoriesProduct`.
   *
   * @dataflow Query params -> Prisma product.findMany() filtered by isCustomProduct='true'
   *   -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} term - Search term.
   * @param {any} adminId - Admin ID filter.
   * @param {any} sortType - Sort order.
   * @param {any} req - Express request.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} userType - Seller type filter.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllFactoriesProduct(
    page: any,

    limit: any,

    term: any,

    adminId: any,

    sortType: any,

    req: any,

    brandIds: any,

    userType: any,
  ) {
    return this.productFactoryService.getAllFactoriesProduct(page, limit, term, adminId, sortType, req, brandIds, userType);
  }

  /**
   * @method getAllFactoriesProductByUserBusinessCategory
   * @description Retrieves factories products matching the user's business category tags.
   *
   * @intent Show personalised factory-direct product recommendations.
   *
   * @usage Called by `ProductController.getAllFactoriesProductByUserBusinessCategory()` via
   *   `GET /product/getAllFactoriesProductByUserBusinessCategory`.
   *
   * @dataflow req.user.id -> user profile category -> product query (menuId=10)
   *   -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getAllFactoriesProductByUserBusinessCategory(req: any) {
    return this.productFactoryService.getAllFactoriesProductByUserBusinessCategory(req);
  }

  /**
   * @method addProductDuplicateFactories
   * @description Duplicates an existing product into the factories system, creating
   *   a factory-specific productPrice (isCustomProduct='true', menuId=10) with
   *   full child-record cloning (images, tags, descriptions, specifications).
   *
   * @intent Allow sellers to clone a product for factory-direct / customised sales.
   *
   * @usage Called by `ProductController.addProductDuplicateFactories()` via
   *   `POST /product/addProductDuplicateFactories`.
   *
   * @dataflow payload (productId + overrides) -> clone product + create factory productPrice
   *   + copy child records -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} payload - Source product ID and factory-specific overrides.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addProductDuplicateFactories(payload: any, req: any) {
    return this.productFactoryService.addProductDuplicateFactories(payload, req);
  }

  /**
   * @method addCustomizeProduct
   * @description Creates a customised product variant from a factory product.
   *
   * @intent Allow buyers to submit customisation requests for factory products.
   *
   * @usage Called by `ProductController.addCustomizeProduct()` via
   *   `POST /product/addCustomizeProduct`.
   *
   * @dataflow payload (productId, customisation details) -> Prisma customizeProduct.create()
   *   -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} payload - Customisation request data.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addCustomizeProduct(payload: any, req: any) {
    return this.productFactoryService.addCustomizeProduct(payload, req);
  }

  /**
   * @method createFactoriesRequest
   * @description Creates a request to a factory for product manufacturing, with notification.
   *
   * @intent Allow buyers to formally request factory production of a customised product.
   *
   * @usage Called by `ProductController.createFactoriesRequest()` via
   *   `POST /product/createFactoriesRequest`.
   *
   * @dataflow payload (factory details, product specs) -> Prisma factoriesRequest.create()
   *   + NotificationService dispatch -> { status, message, data }
   *
   * @dependencies HelperService, NotificationService, PrismaClient
   *
   * @param {any} payload - Factory request data.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async createFactoriesRequest(payload, req) {
    return this.productFactoryService.createFactoriesRequest(payload, req);
  }

  /* ---------------------------------------------------------- Buy Group Product --------------------------------------------------------  */

  /**
   * @method getAllBuyGroupProduct
   * @description Retrieves a paginated list of buy-group products (sellType='BUYGROUP',
   *   menuId=9) with full storefront filtering.
   *
   * @intent Power the Buy Group product listing page for group-buying.
   *
   * @usage Called by `ProductController.getAllBuyGroupProduct()` via
   *   `GET /product/getAllBuyGroupProduct`.
   *
   * @dataflow Query params -> Prisma product.findMany() filtered by sellType BUYGROUP
   *   -> { status, message, data, totalCount }
   *
   * @dependencies PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request.
   * @param {any} term - Search term.
   * @param {any} sort - Sort key.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} priceMin - Minimum price filter.
   * @param {any} priceMax - Maximum price filter.
   * @param {any} userId - Optional user ID.
   * @param {any} categoryIds - Comma-separated category IDs.
   * @param {any} userType - Seller type filter.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllBuyGroupProduct(
    page: any,

    limit: any,

    req: any,

    term: any,

    sort: any,

    brandIds: any,

    priceMin: any,

    priceMax: any,

    userId: any,

    categoryIds: any,

    userType: any,
  ) {
    return this.productBuyGroupService.getAllBuyGroupProduct(page, limit, req, term, sort, brandIds, priceMin, priceMax, userId, categoryIds, userType);
  }

  /**
   * @method getAllBuyGroupProductByUserBusinessCategory
   * @description Retrieves buy-group products matching the user's business category tags.
   *
   * @intent Show personalised buy-group product recommendations.
   *
   * @usage Called by `ProductController.getAllBuyGroupProductByUserBusinessCategory()` via
   *   `GET /product/getAllBuyGroupProductByUserBusinessCategory`.
   *
   * @dataflow req.user.id -> user profile category -> product query (menuId=9)
   *   -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getAllBuyGroupProductByUserBusinessCategory(req: any) {
    return this.productBuyGroupService.getAllBuyGroupProductByUserBusinessCategory(req);
  }

  /* --------------------------------------------------------- Share Link Product -------------------------------------------------------  */

  /**
   * @method createSellerRewardProduct
   * @description Creates a seller reward programme entry linked to a product-price.
   *
   * @intent Allow sellers to configure reward/incentive programmes on listings.
   *
   * @usage Called by `ProductController.createSellerRewardProduct()` via
   *   `POST /product/createSellerRewardProduct`.
   *
   * @dataflow payload (productPriceId, reward config) + req.user.id
   *   -> Prisma sellerReward.create() -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} payload - Reward configuration data.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async createSellerRewardProduct(payload: any, req: any) {
    try {
      let userId = req?.user?.id;

      userId = await this.helperService.getAdminId(userId);


      const {
        productId,

        startTime,

        endTime,

        rewardPercentage,

        rewardFixAmount,

        minimumOrder,

        stock,
      } = req.body;

      let productDetail = await this.prisma.product.findUnique({
        where: { id: parseInt(productId) },

        select: {
          id: true,

          adminId: true,
        },
      });

      if (userId != productDetail?.adminId) {
        return {
          status: false,

          message:
            'Cannot create reward, you are not the seller of the product',

          data: [],
        };
      }

      let existSellerReward = await this.prisma.sellerReward.findFirst({
        where: {
          productId: productId,

          adminId: userId,
        },
      });

      if (existSellerReward) {
        return {
          status: false,

          message: 'Seller Reward already added.',

          data: existSellerReward,
        };
      }

      let productPrice = await this.prisma.productPrice.findFirst({
        where: {
          productId: productId,
        },

        select: {
          id: true,

          stock: true,
        },
      });

      if (stock > productPrice.stock) {
        return {
          status: false,

          message: 'Reward Stock cannot be more than product stock',

          data: [],
        };
      }

      let newSellerReward = await this.prisma.sellerReward.create({
        data: {
          adminId: userId,

          productId: productId,

          startTime: new Date(startTime),

          endTime: new Date(endTime),

          rewardPercentage: rewardPercentage,

          rewardFixAmount: rewardFixAmount,

          minimumOrder: minimumOrder,

          stock: stock,
        },
      });

      return {
        status: true,

        message: 'Seller Reward Added Successfully',

        data: newSellerReward,

        selectedAdminId: userId,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in createSharelinkProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllSellerReward
   * @description Retrieves all seller reward entries for the authenticated user, paginated.
   *
   * @intent Power the seller's "My Rewards" dashboard.
   *
   * @usage Called by `ProductController.getAllSellerReward()` via
   *   `GET /product/getAllSellerReward`.
   *
   * @dataflow req.user.id + pagination/term -> Prisma sellerReward.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} term - Search term.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllSellerReward(page: any, limit: any, term: any, req: any) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const sortType = req.query.sortType ? req.query.sortType : 'desc';

      // Handle both user object structures (from User model or custom object)

      let adminId = req.user.id || req.user.userId;

      adminId = await this.helperService.getAdminId(adminId);


      let whereCondition: any = {
        status: 'ACTIVE',

        adminId: req?.query?.productId ? undefined : adminId,

        productId: req?.query?.productId
          ? parseInt(req.query.productId)
          : undefined,
      };

      let getAllSellerReward = await this.prisma.sellerReward.findMany({
        where: whereCondition,

        include: {
          productDetail: {
            include: {
              productImages: {
                where: { status: 'ACTIVE' },
              },
            },
          },
        },

        orderBy: { createdAt: sortType },

        skip,

        take: pageSize,
      });

      let getAllSellerRewardCount = await this.prisma.sellerReward.count({
        where: whereCondition,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllSellerReward,

        totalCount: getAllSellerRewardCount,

        selectedAdminId: adminId,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllSellerReward',

        error: getErrorMessage(error),
      };
    }
  }

  /** --------------------------------------------------------- Generate Link Product --------------------------------------------------- */

  /**
   * @method generateLink
   * @description Creates a shareable product link associated with a seller reward.
   *
   * @intent Enable affiliates/resellers to generate trackable sharing links.
   *
   * @usage Called by `ProductController.generateLink()` via `POST /product/generateLink`.
   *
   * @dataflow payload (sellerRewardId, link config) + req.user.id
   *   -> Prisma sharedLink.create() -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} payload - Link generation data.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async generateLink(payload: any, req: any) {
    try {
      // const userId = req.user.id;

      let userId = req?.user?.id;

      userId = await this.helperService.getAdminId(userId);


      const { sellerRewardId, generatedLink } = req.body;

      let sellerRewardDetail = await this.prisma.sellerReward.findUnique({
        where: {
          id: parseInt(sellerRewardId),
        },
      });

      if (!sellerRewardDetail) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let existGenerateLink = await this.prisma.sharedLink.findFirst({
        where: {
          sellerRewardId: sellerRewardId,

          productId: sellerRewardDetail.productId,

          linkGeneratedBy: userId,
        },
      });

      if (existGenerateLink) {
        return {
          status: false,

          message: 'Already Exist',

          data: existGenerateLink,
        };
      }

      let newGenerateLink = await this.prisma.sharedLink.create({
        data: {
          sellerRewardId: sellerRewardId,

          productId: sellerRewardDetail.productId,

          adminId: sellerRewardDetail.adminId,

          generatedLink: generatedLink,

          linkGeneratedBy: userId,
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: newGenerateLink,

        selectedAdminId: userId,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in generateLink',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllGenerateLink
   * @description Retrieves all generated links for the authenticated user, paginated.
   *
   * @intent Power the "My Generated Links" dashboard.
   *
   * @usage Called by `ProductController.getAllGenerateLink()` via
   *   `GET /product/getAllGenerateLink`.
   *
   * @dataflow req.user.id + pagination/term -> Prisma sharedLink.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} term - Search term.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllGenerateLink(page: any, limit: any, term: any, req: any) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const sortType = req.query.sortType ? req.query.sortType : 'desc';

      // Handle both user object structures (from User model or custom object)

      let userId = req.user.id || req.user.userId;

      userId = await this.helperService.getAdminId(userId);


      let whereCondition: any = {
        linkGeneratedBy: parseInt(userId),

        productId: req?.query?.productId
          ? parseInt(req.query.productId)
          : undefined,
      };

      let getAllGenerateLink = await this.prisma.sharedLink.findMany({
        where: whereCondition,

        include: {
          productDetail: {
            include: {
              productImages: { where: { status: 'ACTIVE' } },
            },
          },
        },

        orderBy: { createdAt: sortType },

        skip,

        take: pageSize,
      });

      let getAllGenerateLinkCount = await this.prisma.sharedLink.count({
        where: whereCondition,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllGenerateLink,

        totalCount: getAllGenerateLinkCount,

        selectedAdminId: userId,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllGenerateLink',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllGenerateLinkBySellerRewardId
   * @description Retrieves all generated links scoped to a specific seller reward.
   *
   * @intent Show all affiliate links generated under a particular reward programme.
   *
   * @usage Called by `ProductController.getAllGenerateLinkBySellerRewardId()` via
   *   `GET /product/getAllGenerateLinkBySellerRewardId`.
   *
   * @dataflow req.user.id + req.query.sellerRewardId + pagination
   *   -> Prisma sharedLink.findMany() -> { status, message, data, totalCount }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} term - Search term.
   * @param {any} req - Express request with `user.id` and `sellerRewardId` query param.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getAllGenerateLinkBySellerRewardId(
    page: any,

    limit: any,

    term: any,

    req: any,
  ) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const sortType = req.query.sortType ? req.query.sortType : 'desc';

      const sellerRewardId = req.query.sellerRewardId;

      let whereCondition: any = {
        sellerRewardId: parseInt(sellerRewardId),

        productId: req?.query?.productId
          ? parseInt(req.query.productId)
          : undefined,
      };

      let getGeneratedLink = await this.prisma.sharedLink.findMany({
        where: whereCondition,

        include: {
          linkGeneratedByDetail: {
            select: {
              id: true,

              firstName: true,

              lastName: true,

              tradeRole: true,

              userType: true,

              profilePicture: true,

              cc: true,

              phoneNumber: true,
            },
          },
        },

        orderBy: { createdAt: sortType },

        skip,

        take: pageSize,
      });

      let getAllGeneratedLinkCount = await this.prisma.sharedLink.count({
        where: whereCondition,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getGeneratedLink,

        totalCount: getAllGeneratedLinkCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllGenerateLinkBySellerRewardId',

        error: getErrorMessage(error),
      };
    }
  }

  /***

   *  DELETE ALL PRODUCT ONLY USED BY BACKEND MANUALLY

   */

  /**
   * @method deleteProductFromBackend2
   * @description Alternative implementation of bulk hard-delete for all product data.
   *
   * @intent Administrative / development utility for bulk data cleanup.
   *
   * @usage Not currently exposed via any controller endpoint (internal variant).
   *
   * @dataflow Prisma deleteMany() on product-related tables in sequence
   *   -> { status, message }
   *
   * @dependencies PrismaClient
   *
   * @notes **DANGEROUS** -- permanently removes all product data. Development use only.
   *
   * @param {any} req - Express request object.
   * @returns {Promise<{status: boolean, message: string, error?: string}>}
   */
  async deleteProductFromBackend2(req: any) {
    try {
      let productIds = req.body.productIds;

      await this.prisma.productTags.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productImages.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.cart.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.orderProducts.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productReview.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.rFQCart.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.rfqQuotesProducts.deleteMany({
        where: {
          rfqProductId: { in: productIds },
        },
      });

      await this.prisma.wishlist.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productPrice.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productShortDescription.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productSpecification.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.customizeProduct.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.factoriesCart.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productSellCountry.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productSellState.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.productSellCity.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.sellerReward.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      await this.prisma.sharedLink.deleteMany({
        where: {
          productId: { in: productIds },
        },
      });

      let productDetail = await this.prisma.product.deleteMany({
        where: { id: { in: productIds } },
      });

      return {
        status: true,

        message: 'Products deleted successfully',
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in deleteProductFromBackend',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteProductFromBackend
   * @description Permanently hard-deletes products and all related child records from
   *   the database, with per-table deletion logging.
   *
   * @intent Provide an administrative / development utility for irreversible bulk data
   *   cleanup when soft-delete is not sufficient (e.g. seeded test data removal).
   *
   * @usage Called by `ProductController.deleteProductFromBackend()` via
   *   `DELETE /product/deleteProductFromBackend` (SuperAdminAuthGuard).
   *
   * @dataflow req.body.productIds (number[]) -> sequential Prisma deleteMany() on every
   *   dependent table (tags, images, cart, orders, reviews, RFQ carts, RFQ quotes,
   *   wishlists, prices, short descriptions, specifications, customise products,
   *   factories carts, sell regions, seller rewards, shared links, duplicate RFQs)
   *   -> product.deleteMany() -> { status, message }
   *
   * @dependencies PrismaClient
   *
   * @notes
   *   - **DANGEROUS** -- permanently removes all data for the supplied product IDs.
   *   - Uses a helper `deleteAndLog()` closure to log the count of deleted rows per table.
   *   - Unlike `deleteProductFromBackend2`, this variant also deletes `productDuplicateRfq`.
   *   - Intended for backend-only / manual use.
   *
   * @param {any} req - Express request with `body.productIds` (number[]).
   * @returns {Promise<{status: boolean, message: string, error?: string}>}
   */
  async deleteProductFromBackend(req: any) {
    try {
      let productIds = req.body.productIds;

      const deleteAndLog = async (modelName: string, deleteOperation: any) => {
        const result = await deleteOperation;

      };

      await deleteAndLog(
        'productTags',

        this.prisma.productTags.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productImages',

        this.prisma.productImages.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'cart',

        this.prisma.cart.deleteMany({ where: { productId: { in: productIds } } }),
      );

      await deleteAndLog(
        'orderProducts',

        this.prisma.orderProducts.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productReview',

        this.prisma.productReview.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'rFQCart',

        this.prisma.rFQCart.deleteMany({ where: { productId: { in: productIds } } }),
      );

      await deleteAndLog(
        'rfqQuotesProducts',

        this.prisma.rfqQuotesProducts.deleteMany({
          where: { rfqProductId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'wishlist',

        this.prisma.wishlist.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productPrice',

        this.prisma.productPrice.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productShortDescription',

        this.prisma.productShortDescription.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productSpecification',

        this.prisma.productSpecification.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'customizeProduct',

        this.prisma.customizeProduct.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'factoriesCart',

        this.prisma.factoriesCart.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productSellCountry',

        this.prisma.productSellCountry.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productSellState',

        this.prisma.productSellState.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productSellCity',

        this.prisma.productSellCity.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'sellerReward',

        this.prisma.sellerReward.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'sharedLink',

        this.prisma.sharedLink.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      await deleteAndLog(
        'productDuplicateRfq',

        this.prisma.productDuplicateRfq.deleteMany({
          where: { productId: { in: productIds } },
        }),
      );

      const productDeletion = await this.prisma.product.deleteMany({
        where: { id: { in: productIds } },
      });


      return {
        status: true,

        message: 'Products deleted successfully',
      };
    } catch (error) {

      return {
        status: false,

        message: 'Error in deleteProductFromBackend',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getMostSoldProducts
   * @description Retrieves products ranked by total units sold (aggregated from order
   *   line items), with full product details and pagination.
   *
   * @intent Power a "Best Sellers" / "Most Sold Products" analytics or storefront page.
   *
   * @usage Called by `ProductController.getMostSoldProducts()` via
   *   `GET /product/getMostSoldProducts`.
   *
   * @dataflow
   *   1. `orderProducts.groupBy(['productId'])` aggregates `orderQuantity` descending.
   *   2. Top product IDs are extracted and used to fetch full `product` records with
   *      brand, category, images, short descriptions, and active price rows.
   *   3. Results are merged back preserving the original sales-rank order, with a
   *      `totalSold` field appended to each product.
   *   4. A separate `groupBy` count provides pagination metadata.
   *
   * @dependencies PrismaClient
   *
   * @notes
   *   - Default limit is 100 000, effectively returning all products when no limit is set.
   *   - Only non-deleted order products (`deletedAt: null`) with a non-null `productId`
   *     are included in the aggregation.
   *   - The response includes raw `mostSoldProducts` and `productIds` for debugging.
   *
   * @param {any} req - Express request with optional `query.page` and `query.limit`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], mostSoldProducts?: any[],
   *   productIds?: number[], totalproducts?: number, pagination?: object, error?: string}>}
   */
  async getMostSoldProducts(req: any) {
    return this.productMediaService.getMostSoldProducts(req);
    // --- Delegated to ProductMediaService ---
    try {
      const page = parseInt(req.query.page) || 1;

      const limit = parseInt(req.query.limit) || 100000;

      const skip = (page - 1) * limit;

      // Step 1: Get top product IDs by sales

      const mostSoldProducts = await this.prisma.orderProducts.groupBy({
        by: ['productId'],

        _sum: {
          orderQuantity: true,
        },

        where: {
          deletedAt: null,

          productId: {
            not: null,
          },
        },

        orderBy: {
          _sum: {
            orderQuantity: 'desc',
          },
        },

        skip,

        take: limit,
      });

      const productIds = mostSoldProducts.map((p) => p.productId);

      // Step 2: Fetch corresponding product details

      const products = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },

          deletedAt: null,
        },

        include: {
          brand: true,

          category: true,

          productImages: true,

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Step 3: Attach totalSold and preserve original order

      const productMap = new Map<number, any>();

      products.forEach((p) => productMap.set(p.id, p));

      const finalResult = mostSoldProducts

        .map((item) => {
          const product = productMap.get(item.productId);

          if (!product) return null;

          return {
            ...product,

            totalSold: item._sum.orderQuantity || 0,
          };
        })

        .filter(Boolean);

      // Step 4: Get total count for pagination

      const totalCount = await this.prisma.orderProducts.groupBy({
        by: ['productId'],

        where: {
          deletedAt: null,

          productId: {
            not: null,
          },
        },
      });

      return {
        status: true,

        message: 'Most sold products fetched successfully',

        data: finalResult,

        mostSoldProducts,

        productIds,

        totalproducts: finalResult.length,

        pagination: {
          total: totalCount.length,

          page,

          limit,

          totalPages: Math.ceil(totalCount.length / limit),
        },
      };
    } catch (error) {

      return {
        status: false,

        message: 'Server Error',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getProductMostViewCount
   * @description Retrieves products sorted by view count (`productViewCount` DESC) across
   *   three product categories -- standard store products, buy-group products, and
   *   factories (custom) products -- and returns them as separate collections.
   *
   * @intent Power a "Most Viewed Products" dashboard or homepage section that
   *   surfaces trending products across all marketplace channels.
   *
   * @usage Called by `ProductController.getProductMostViewCount()` via
   *   `GET /product/getProductMostViewCount`.
   *
   * @dataflow
   *   1. Standard store query: `sellType = NORMALSELL`, `askForPrice = 'false'`,
   *      `isCustomProduct = 'false'`, ordered by `productViewCount DESC`, limited to
   *      cheapest single price row per product.
   *   2. Buy-group query: `sellType = BUYGROUP`, `dateClose > now()`, same ordering.
   *   3. Factories query: `isCustomProduct = 'true'`, same ordering.
   *   4. All three result sets returned in a single envelope:
   *      `{ product, buyGroupProduct, factoriesProduct }`.
   *
   * @dependencies PrismaClient
   *
   * @notes
   *   - Consumer-type filtering applies based on `req.query.userType`
   *     (COMPANY/FREELANCER -> VENDORS+EVERYONE, BUYER -> CONSUMER+EVERYONE).
   *   - Default page size is 4 items.
   *   - Standard store products include only the lowest `offerPrice` price row (`take: 1`).
   *
   * @param {any} req - Express request with optional `query.page`, `query.limit`,
   *   `query.userType`.
   * @returns {Promise<{status: boolean, message: string,
   *   product?: {productDetailList: any[], productTotalCount: number},
   *   buyGroupProduct?: {getAllBuyGroupProduct: any[], getAllBuyGroupProductCount: number},
   *   factoriesProduct?: {getAllFactoriesProduct: any[], getAllFactoriesProductCount: number},
   *   error?: string}>}
   */
  async getProductMostViewCount(req: any) {
    return this.productMediaService.getProductMostViewCount(req);
    // --- Delegated to ProductMediaService ---
    try {
      let Page = parseInt(req?.query?.page) || 1;

      let pageSize = parseInt(req?.query?.limit) || 4;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      const currentDateTime = new Date();

      const sortType = 'desc';

      let productWhereCondition: any = {
        productType: {
          in: ['P', 'F'],
        },

        status: 'ACTIVE',

        product_productPrice: {
          some: {
            askForPrice: 'false',

            isCustomProduct: 'false',

            sellType: 'NORMALSELL',

            status: 'ACTIVE',
          },
        },
      };

      let productDetailList = await this.prisma.product.findMany({
        where: productWhereCondition,

        include: {
          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              offerPrice: 'asc',
            },

            take: 1, // Limit the result to only 1 row
          },
        },

        orderBy: { productViewCount: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: productWhereCondition,
      });

      // Buy Group Product

      let buyGroupwhereCondition: any = {
        productType: {
          in: ['P'],
        },

        status: 'ACTIVE',

        product_productPrice: {
          some: {
            sellType: 'BUYGROUP',

            status: 'ACTIVE',

            dateClose: {
              gt: currentDateTime,
            },
          },
        },
      };

      let getAllBuyGroupProduct = await this.prisma.product.findMany({
        where: buyGroupwhereCondition,

        include: {
          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },
          },

          product_sellCountry: { where: { status: 'ACTIVE' } },

          product_sellState: { where: { status: 'ACTIVE' } },

          product_sellCity: { where: { status: 'ACTIVE' } },

          orderProducts: true,
        },

        orderBy: { productViewCount: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let getAllBuyGroupProductCount = await this.prisma.product.count({
        where: buyGroupwhereCondition,
      });

      // Factories Product

      let factoriesWhereCondition: Prisma.ProductWhereInput = {
        productType: {
          in: ['P'],
        },

        status: 'ACTIVE',

        product_productPrice: {
          some: {
            isCustomProduct: 'true',

            status: 'ACTIVE',
          },
        },
      };

      let getAllFactoriesProduct = await this.prisma.product.findMany({
        where: factoriesWhereCondition,

        include: {
          category: { where: { status: 'ACTIVE' } },

          brand: { where: { status: 'ACTIVE' } },

          placeOfOrigin: { where: { status: 'ACTIVE' } },

          productTags: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              productTagsTag: true,
            },
          },

          productImages: { where: { status: 'ACTIVE' } },

          productReview: {
            where: { status: 'ACTIVE' },

            select: {
              rating: true,
            },
          },

          product_sellCountry: { where: { status: 'ACTIVE' } },

          product_sellState: { where: { status: 'ACTIVE' } },

          product_sellCity: { where: { status: 'ACTIVE' } },

          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },

            include: {
              adminDetail: {
                select: {
                  id: true,

                  firstName: true,

                  lastName: true,

                  accountName: true,

                  profilePicture: true,

                  tradeRole: true,

                  userProfile: {
                    select: {
                      profileType: true,

                      logo: true,

                      companyName: true,
                    },
                  },
                },
              },
            },
          },
        },

        orderBy: { productViewCount: sortType },

        skip,

        take: pageSize,
      });

      let getAllFactoriesProductCount = await this.prisma.product.count({
        where: factoriesWhereCondition,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        product: {
          productDetailList: productDetailList,

          productTotalCount: productDetailListCount,
        },

        buyGroupProduct: {
          getAllBuyGroupProduct: getAllBuyGroupProduct,

          getAllBuyGroupProductCount: getAllBuyGroupProductCount,
        },

        factoriesProduct: {
          getAllFactoriesProduct: getAllFactoriesProduct,

          getAllFactoriesProductCount: getAllFactoriesProductCount,
        },
      };
    } catch (error) {

      return {
        status: false,

        message: 'Server Error',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method addToExistingProducts
   * @description Copies a product record from the main `product` table into the
   *   `existingProduct` catalogue table, including its images and tags, so it can
   *   be re-used later as a template for new product creation.
   *
   * @intent Allow sellers to "save" a product to an existing-product library for
   *   future duplication, avoiding re-entry of common product data.
   *
   * @usage Called by `ProductController.addToExistingProducts()` via
   *   `POST /product/addToExistingProducts`.
   *
   * @dataflow
   *   1. `payload.productId` -> Prisma `product.findFirst()` with images and tags.
   *   2. Creates an `existingProduct` row cloning core fields (name, category, SKU,
   *      pricing, description, specification, barcode, etc.) with `productViewCount` reset to 0.
   *   3. Iterates over `productImages` to create `existingProductImages` rows.
   *   4. Iterates over `productTags` to create `existingProductTags` rows.
   *   5. Returns the newly created `existingProduct` entry.
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - The original SKU is preserved (`skuNo`) in the existing-product copy.
   *   - `adminId` and `userId` on the copy are both set to the resolved admin ID
   *     of the authenticated user.
   *
   * @param {any} payload - Contains `productId` (number) identifying the source product.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async addToExistingProducts(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      const adminId = await this.helperService.getAdminId(userId);

      // Check if product exists

      const existingProduct = await this.prisma.product.findFirst({
        where: { id: payload.productId },

        include: {
          productImages: true,

          productTags: true,
        },
      });

      if (!existingProduct) {
        return {
          status: false,

          message: 'Product not found',

          data: null,
        };
      }

      // Create a new entry in existing products table

      const existingProductEntry = await this.prisma.existingProduct.create({
        data: {
          productName: existingProduct.productName,

          categoryId: existingProduct.categoryId,

          skuNo: existingProduct.skuNo, // Keep the original SKU number
          productPrice: existingProduct.productPrice,

          offerPrice: existingProduct.offerPrice,

          description: existingProduct.description,

          specification: existingProduct.specification,

          status: 'ACTIVE',

          brandId: existingProduct.brandId,

          placeOfOriginId: existingProduct.placeOfOriginId,

          adminId: adminId,

          userId: adminId,

          categoryLocation: existingProduct.categoryLocation,

          shortDescription: existingProduct.shortDescription,

          productType: existingProduct.productType,

          barcode: existingProduct.barcode,

          typeOfProduct: existingProduct.typeOfProduct,

          typeProduct: existingProduct.typeProduct,

          productViewCount: 0,
        },
      });

      // Copy product images if they exist

      if (
        existingProduct.productImages &&
        existingProduct.productImages.length > 0
      ) {
        for (const image of existingProduct.productImages) {
          await this.prisma.existingProductImages.create({
            data: {
              existingProductId: existingProductEntry.id,

              imageName: image.imageName || null,

              image: image.image || null,

              videoName: image.videoName || null,

              video: image.video || null,

              variant: image.variant || null,

              status: 'ACTIVE',
            },
          });
        }
      }

      // Copy product tags if they exist

      if (
        existingProduct.productTags &&
        existingProduct.productTags.length > 0
      ) {
        for (const tag of existingProduct.productTags) {
          await this.prisma.existingProductTags.create({
            data: {
              existingProductId: existingProductEntry.id,

              tagId: tag.tagId,

              status: 'ACTIVE',
            },
          });
        }
      }

      return {
        status: true,

        message: 'Product added to existing products successfully',

        data: existingProductEntry,
      };
    } catch (error) {

      return {
        status: false,

        message: 'Server Error',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getExistingProducts
   * @description Retrieves all non-deleted existing-product records with their images,
   *   tags, category, brand, and place-of-origin relations, ordered by creation date
   *   descending.
   *
   * @intent Power the "Existing Products" catalogue page where sellers browse
   *   previously saved product templates.
   *
   * @usage Called by `ProductController.getExistingProducts()` via
   *   `GET /product/getExistingProducts`.
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma existingProduct.findMany()
   *   (status != DELETE, deletedAt == null) with includes -> { status, message, data }
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - The query does not filter by `adminId`, so all non-deleted existing products
   *     are returned regardless of ownership.
   *   - Results are ordered by `createdAt DESC`.
   *
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any[], error?: string}>}
   */
  async getExistingProducts(req: any) {
    try {
      const userId = req?.user?.id;

      const adminId = await this.helperService.getAdminId(userId);

      const existingProducts = await this.prisma.existingProduct.findMany({
        where: {
          deletedAt: null,
          status: {
            not: 'DELETE',
          },
        },

        include: {
          existingProductImages: true,

          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },

          category: true,

          brand: true,

          placeOfOrigin: true,
        },

        orderBy: {
          createdAt: 'desc',
        },

        take: 50, // Default page size to prevent unbounded queries
        skip: 0,
      });

      return {
        status: true,

        message: 'Existing products fetched successfully',

        data: existingProducts,
      };
    } catch (error) {

      return {
        status: false,

        message: 'Server Error',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateExistingProductStatus
   * @description Updates the lifecycle status of an existing-product record owned by
   *   the authenticated admin.
   *
   * @intent Allow sellers to activate, deactivate, or soft-delete entries in their
   *   existing-product catalogue.
   *
   * @usage Called by `ProductController.updateExistingProductStatus()` via
   *   `PATCH /product/updateExistingProductStatus`.
   *
   * @dataflow
   *   1. Validates `existingProductId` (number) and `status` (ACTIVE|INACTIVE|DELETE).
   *   2. Checks ownership (`adminId` matches resolved admin).
   *   3. Prisma `existingProduct.update()` -> { status, message, data }.
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - Ownership check: the existing product's `adminId` must match the caller's
   *     resolved admin ID, otherwise "access denied" is returned.
   *   - Only three status values are accepted: ACTIVE, INACTIVE, DELETE.
   *
   * @param {any} payload - Contains `existingProductId` and `status`.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateExistingProductStatus(payload: any, req: any) {
    try {
      const { existingProductId, status } = payload;
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      // Validate existingProductId
      if (!existingProductId || isNaN(Number(existingProductId))) {
        return {
          status: false,
          message: 'Invalid existing product ID',
        };
      }

      // Convert to number to ensure type safety
      const productId = Number(existingProductId);

      // Validate status
      if (!['ACTIVE', 'INACTIVE', 'DELETE'].includes(status)) {
        return {
          status: false,
          message:
            'Invalid status. Status must be either ACTIVE, INACTIVE, or DELETE',
        };
      }

      // Check if existing product exists and belongs to the admin
      const existingProduct = await this.prisma.existingProduct.findFirst({
        where: {
          id: productId,
          adminId: adminId,
          deletedAt: null,
        },
      });

      if (!existingProduct) {
        return {
          status: false,
          message: 'Existing product not found or access denied',
        };
      }

      // Update the status of the existing product
      const updatedExistingProduct = await this.prisma.existingProduct.update({
        where: {
          id: productId,
        },
        data: {
          status: status as any, // Type assertion to fix linter error
        },
      });

      return {
        status: true,
        message: `Existing product status updated to ${status} successfully`,
        data: updatedExistingProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  async bulkUpdateExistingProductStatus(payload: any, req: any) {
    try {
      const { existingProductIds, status } = payload;
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);


      // Validate input
      if (!existingProductIds || !Array.isArray(existingProductIds) || existingProductIds.length === 0) {
        return {
          status: false,
          message: 'Invalid product IDs. Please provide an array of product IDs.',
        };
      }

      // Validate status
      if (!['ACTIVE', 'INACTIVE', 'DELETE'].includes(status)) {
        return {
          status: false,
          message: 'Invalid status. Status must be either ACTIVE, INACTIVE, or DELETE',
        };
      }

      // Convert all IDs to numbers
      const productIds = existingProductIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id));

      if (productIds.length === 0) {
        return {
          status: false,
          message: 'No valid product IDs provided.',
        };
      }

      // First, verify that all products belong to the admin
      const existingProducts = await this.prisma.existingProduct.findMany({
        where: {
          id: {
            in: productIds,
          },
          adminId: adminId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      const validProductIds = existingProducts.map((ep) => ep.id);

      if (validProductIds.length === 0) {
        return {
          status: false,
          message: 'No existing products found that belong to you.',
        };
      }

      // Update all valid products in a single query
      const updateResult = await this.prisma.existingProduct.updateMany({
        where: {
          id: {
            in: validProductIds,
          },
        },
        data: {
          status: status as any,
        },
      });


      return {
        status: true,
        message: `Successfully updated ${updateResult.count} product(s) to ${status}`,
        data: {
          updatedCount: updateResult.count,
          requestedCount: productIds.length,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to bulk update product status',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteExistingProduct
   * @description Soft-deletes an existing-product record by setting its status to
   *   'DELETE' and populating `deletedAt`.
   *
   * @intent Allow sellers to remove entries from their existing-product catalogue
   *   without permanently destroying data.
   *
   * @usage Called by `ProductController.deleteExistingProduct()` via
   *   `DELETE /product/deleteExistingProduct`.
   *
   * @dataflow
   *   1. Validates `existingProductId` (number, not NaN).
   *   2. Checks ownership (`adminId` matches resolved admin) and `deletedAt == null`.
   *   3. Prisma `existingProduct.update()` with `{ status: 'DELETE', deletedAt: new Date() }`.
   *   4. Returns success envelope.
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - Uses the standard soft-delete pattern: `status = 'DELETE'` + `deletedAt = now()`.
   *   - Ownership check ensures only the product's admin can delete it.
   *
   * @param {number} existingProductId - Primary key of the existing-product record.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, error?: string}>}
   */
  async deleteExistingProduct(existingProductId: number, req: any) {
    try {
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      // Validate existingProductId
      if (!existingProductId || isNaN(existingProductId)) {
        return {
          status: false,
          message: 'Invalid existing product ID',
        };
      }

      // Check if existing product exists and belongs to the admin
      const existingProduct = await this.prisma.existingProduct.findFirst({
        where: {
          id: existingProductId,
          adminId: adminId,
          deletedAt: null,
        },
      });

      if (!existingProduct) {
        return {
          status: false,
          message: 'Existing product not found or access denied',
        };
      }

      // Soft delete the existing product
      await this.prisma.existingProduct.update({
        where: {
          id: existingProductId,
        },
        data: {
          status: 'DELETE',
          deletedAt: new Date(),
        },
      });

      return {
        status: true,
        message: 'Existing product deleted successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method searchExistingProducts
   * @description Searches the existing-product catalogue with pagination, text search
   *   (product name or SKU), and optional brand/category/price-range filters.
   *
   * @intent Power the search and filter UI on the existing-products listing page.
   *
   * @usage Called by `ProductController.searchExistingProducts()` via
   *   `GET /product/searchExistingProducts`.
   *
   * @dataflow
   *   1. Builds a `whereCondition` with `deletedAt == null`, `status != DELETE`.
   *   2. Optionally adds an `OR` clause for case-insensitive `productName` / `skuNo` search.
   *   3. Optionally adds `categoryId`, `brandId`, and `offerPrice` range filters.
   *   4. Prisma `existingProduct.findMany()` with images, tags, category, brand,
   *      place-of-origin includes, plus `existingProduct.count()` for pagination.
   *   5. Returns `{ status, message, data, totalCount }`.
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - The `adminId` filter is currently commented out for debugging, meaning all
   *     non-deleted existing products are searchable regardless of ownership.
   *   - `term` triggers an `OR` clause across `productName` and `skuNo`.
   *
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {any} req - Express request with `user.id` from JWT.
   * @param {string} [term] - Optional search term for name/SKU matching.
   * @param {string} [sort] - Sort direction ('asc' or 'desc', defaults to 'desc').
   * @param {string} [brandIds] - Comma-separated brand IDs filter.
   * @param {number} [priceMin] - Minimum offer-price filter.
   * @param {number} [priceMax] - Maximum offer-price filter.
   * @param {string} [categoryIds] - Comma-separated category IDs filter.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async searchExistingProducts(
    page: number,
    limit: number,
    req: any,
    term?: string,
    sort?: string,
    brandIds?: string,
    priceMin?: number,
    priceMax?: number,
    categoryIds?: string,
  ) {
    return this.productSearchService.searchExistingProducts(page, limit, req, term, sort, brandIds, priceMin, priceMax, categoryIds);
    // --- Delegated to ProductSearchService ---
    try {
      let Page = parseInt(page.toString()) || 1;
      let pageSize = parseInt(limit.toString()) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 0 ? term : '';
      const sortType = sort ? sort : 'desc';
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);


      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: [],
          totalCount: 0,
        };
      }

      let whereCondition: any = {
        deletedAt: null,
        status: 'ACTIVE',
        // Temporarily comment out adminId filter for debugging
        // adminId: adminId,
      };

      // Add search term if provided
      if (searchTerm) {
        whereCondition.OR = [
          {
            productName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            skuNo: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ];
      }

      // Add category filter
      if (categoryIds) {
        whereCondition.categoryId = {
          in: categoryIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      // Add brand filter
      if (brandIds) {
        whereCondition.brandId = {
          in: brandIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      // Add price filter
      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin.toString()),
          lte: parseFloat(priceMax.toString()),
        };
      }


      const existingProducts = await this.prisma.existingProduct.findMany({
        where: whereCondition,
        include: {
          existingProductImages: true,
          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
        orderBy: {
          createdAt: sortType === 'desc' ? 'desc' : 'asc',
        },
        skip,
        take: pageSize,
      });


      const totalCount = await this.prisma.existingProduct.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Existing products fetched successfully',
        data: existingProducts,
        totalCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method searchExistingProductsForCopy
   * @description Searches existing products that the authenticated user owns or was
   *   added by, intended for the "Add from Existing Product" copy workflow.
   *
   * @intent Allow sellers to find their own existing-product templates when creating
   *   a new product by copying from an existing one.
   *
   * @usage Called by `ProductController.searchExistingProductsForCopy()` via
   *   `GET /product/searchExistingProductsForCopy`.
   *
   * @dataflow
   *   1. Builds a `whereCondition` with `deletedAt == null`, `status != DELETE`, and
   *      an `OR` ownership clause: `adminId`, `userId`, or `addedBy` matches the
   *      resolved admin ID.
   *   2. Optionally extends `OR` with text-search clauses for `productName` / `skuNo`.
   *   3. Optionally adds `brandId`, `offerPrice` range, and `categoryId` filters.
   *   4. Prisma `existingProduct.findMany()` with images, tags, category, brand,
   *      place-of-origin includes, plus `existingProduct.count()` for pagination.
   *   5. Returns `{ status, message, data, totalCount }`.
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - Unlike `searchExistingProducts`, this method enforces an ownership filter
   *     (`adminId` / `userId` / `addedBy`), restricting results to the caller's products.
   *   - When a search term is provided, it is appended to the existing `OR` array
   *     alongside the ownership clauses.
   *
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {any} req - Express request with `user.id` from JWT.
   * @param {string} [term] - Optional search term for name/SKU matching.
   * @param {string} [sort] - Sort direction ('asc' or 'desc', defaults to 'desc').
   * @param {string} [brandIds] - Comma-separated brand IDs filter.
   * @param {string} [priceMin] - Minimum offer-price filter.
   * @param {string} [priceMax] - Maximum offer-price filter.
   * @param {string} [categoryIds] - Comma-separated category IDs filter.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async searchExistingProductsForCopy(
    page: number,
    limit: number,
    req: any,
    term?: string,
    sort?: string,
    brandIds?: string,
    priceMin?: string,
    priceMax?: string,
    categoryIds?: string,
  ) {
    return this.productSearchService.searchExistingProductsForCopy(page, limit, req, term, sort, brandIds, priceMin, priceMax, categoryIds);
    // --- Delegated to ProductSearchService ---
    try {
      let Page = parseInt(page.toString()) || 1;
      let pageSize = parseInt(limit.toString()) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 0 ? term : '';
      const sortType = sort ? sort : 'desc';

      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: [],
          totalCount: 0,
        };
      }

      let whereCondition: any = {
        deletedAt: null,
        status: 'ACTIVE',
        OR: [{ adminId: adminId }, { userId: adminId }, { addedBy: adminId }],
      };

      // Add search term if provided
      if (searchTerm) {
        whereCondition.OR = [
          ...whereCondition.OR,
          {
            productName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            skuNo: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ];
      }

      // Add brand filter
      if (brandIds) {
        whereCondition.brandId = {
          in: brandIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      // Add price filter
      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin.toString()),
          lte: parseFloat(priceMax.toString()),
        };
      }

      // Add category filter
      if (categoryIds) {
        whereCondition.categoryId = {
          in: categoryIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      const existingProducts = await this.prisma.existingProduct.findMany({
        where: whereCondition,
        include: {
          existingProductImages: true,
          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
        orderBy: {
          createdAt: sortType === 'desc' ? 'desc' : 'asc',
        },
        skip,
        take: pageSize,
      });

      const totalCount = await this.prisma.existingProduct.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Existing products fetched successfully for copy',
        data: existingProducts,
        totalCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getExistingProductById
   * @description Fetches a single existing-product record by its primary key, with full
   *   relational includes, for the copy-to-new-product workflow.
   *
   * @intent Provide all data needed to pre-populate the "Create Product" form when the
   *   seller chooses to duplicate an existing-product template.
   *
   * @usage Called by `ProductController.getExistingProductById()` /
   *   `ProductController.getExistingProductByIdPath()` via
   *   `GET /product/getExistingProductById` or `GET /product/getExistingProductById/:id`.
   *
   * @dataflow
   *   1. Validates `adminId` via `HelperService.getAdminId()`.
   *   2. Prisma `existingProduct.findFirst()` with `deletedAt == null`, `status != DELETE`,
   *      including images, tags (with tag details), category, brand, place-of-origin.
   *   3. Returns `{ status, message, data }`.
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - The ownership restriction is intentionally removed so that any authenticated
   *     user can view an existing product for copy purposes.
   *
   * @param {number} existingProductId - Primary key of the existing-product record.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getExistingProductById(existingProductId: number, req: any) {
    try {
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);


      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: null,
        };
      }

      // First, let's check if the product exists without the OR condition
      const productExists = await this.prisma.existingProduct.findFirst({
        where: {
          id: existingProductId,
          deletedAt: null,
          status: {
            not: 'DELETE',
          },
        },
      });

      if (productExists) {
      }

      // For copy functionality, we should allow access to any existing product
      // that the current user can view (not just their own products)
      const existingProduct = await this.prisma.existingProduct.findFirst({
        where: {
          id: existingProductId,
          deletedAt: null,
          status: {
            not: 'DELETE',
          },
          // Remove the restrictive OR condition for copy functionality
          // Users should be able to copy any existing product they can see
        },
        include: {
          existingProductImages: true,
          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
      });

      if (!existingProduct) {
        return {
          status: false,
          message: 'Existing product not found',
          data: null,
        };
      }

      return {
        status: true,
        message: 'Existing product fetched successfully',
        data: existingProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateExistingProduct
   * @description Updates the mutable fields of an existing-product template record
   *   (name, category, brand, SKU, pricing, descriptions, specification, etc.).
   *
   * @intent Allow sellers to keep their existing-product catalogue up to date so that
   *   future copies reflect current product information.
   *
   * @usage Called by `ProductController.updateExistingProduct()` via
   *   `PATCH /product/updateExistingProduct`.
   *
   * @dataflow
   *   1. Validates `adminId` via `HelperService.getAdminId()`.
   *   2. Resolves `existingProductId` from `payload.existingProductId` or `payload.productId`.
   *   3. Checks existence (`deletedAt == null`, `status != DELETE`).
   *   4. Prisma `existingProduct.update()` with the supplied fields and `updatedAt = now()`.
   *   5. Returns the updated record with full includes (images, tags, category, brand,
   *      place-of-origin).
   *
   * @dependencies HelperService, PrismaClient
   *
   * @notes
   *   - The ownership restriction is not enforced -- any authenticated admin can update
   *     any non-deleted existing product. Consider adding an `adminId` check if stricter
   *     access control is required.
   *   - `productPrice` and `offerPrice` default to 0 when not provided in the payload.
   *
   * @param {any} payload - Contains `existingProductId` (or `productId`) and optional
   *   updatable fields: `productName`, `categoryId`, `brandId`, `skuNo`, `productPrice`,
   *   `offerPrice`, `shortDescription`, `description`, `specification`,
   *   `categoryLocation`, `placeOfOriginId`.
   * @param {any} req - Express request with `user.id` from JWT.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateExistingProduct(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);


      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: null,
        };
      }

      const existingProductId = payload.existingProductId || payload.productId;

      if (!existingProductId) {
        return {
          status: false,
          message: 'Existing product ID is required',
          data: null,
        };
      }

      // Check if the existing product exists and belongs to the user
      const existingProduct = await this.prisma.existingProduct.findFirst({
        where: {
          id: existingProductId,
          deletedAt: null,
          status: {
            not: 'DELETE',
          },
        },
      });

      if (!existingProduct) {
        return {
          status: false,
          message: 'Existing product not found',
          data: null,
        };
      }

      // Update the existing product
      const updatedProduct = await this.prisma.existingProduct.update({
        where: {
          id: existingProductId,
        },
        data: {
          productName: payload.productName,
          categoryId: payload.categoryId,
          brandId: payload.brandId,
          skuNo: payload.skuNo,
          productPrice: payload.productPrice || 0,
          offerPrice: payload.offerPrice || 0,
          shortDescription: payload.shortDescription,
          description: payload.description,
          specification: payload.specification,
          categoryLocation: payload.categoryLocation,
          placeOfOriginId: payload.placeOfOriginId,
          updatedAt: new Date(),
        },
        include: {
          existingProductImages: true,
          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
      });

      return {
        status: true,
        message: 'Existing product updated successfully',
        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  // Dropshipping methods
  async createDropshipableProduct(payload: any, req: any) {
    try {
      const {
        originalProductId,
        customProductName,
        customDescription,
        marketingText,
        additionalImages,
        markup,
      } = payload;

      // Get original product
      const originalProduct = await this.prisma.product.findUnique({
        where: { id: originalProductId },
        include: {
          productImages: true,
          product_productPrice: true,
          userBy: true,
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
      });

      if (!originalProduct) {
        return {
          status: false,
          message: 'Original product not found',
          data: null,
        };
      }

      // Check if product is dropshipable
      if (!originalProduct.isDropshipable) {
        return {
          status: false,
          message: 'This product is not available for dropshipping',
          data: null,
        };
      }

      // Check if user is trying to dropship their own product
      if (originalProduct.userId === req.user.id) {
        return {
          status: false,
          message: 'You cannot dropship your own product',
          data: null,
        };
      }

      // Validate markup against vendor's limits
      if (
        originalProduct.dropshipMinMarkup &&
        markup < Number(originalProduct.dropshipMinMarkup)
      ) {
        return {
          status: false,
          message: `Minimum markup for this product is ${originalProduct.dropshipMinMarkup}%`,
          data: null,
        };
      }

      if (
        originalProduct.dropshipMaxMarkup &&
        markup > Number(originalProduct.dropshipMaxMarkup)
      ) {
        return {
          status: false,
          message: `Maximum markup for this product is ${originalProduct.dropshipMaxMarkup}%`,
          data: null,
        };
      }

      // Calculate new pricing
      const originalPrice = Number(originalProduct.productPrice);
      const newPrice = originalPrice + Number(markup);

      // Generate unique SKU for dropship product
      const dropshipSku = `DS_${originalProduct.skuNo}_${Date.now()}`;

      // Create dropship product
      const dropshipProduct = await this.prisma.product.create({
        data: {
          productName: customProductName || originalProduct.productName,
          description: customDescription || originalProduct.description,
          productPrice: newPrice,
          offerPrice: newPrice,
          skuNo: dropshipSku,

          // Copy essential fields from original
          categoryId: originalProduct.categoryId,
          brandId: originalProduct.brandId,
          placeOfOriginId: originalProduct.placeOfOriginId,
          specification: originalProduct.specification,
          shortDescription: originalProduct.shortDescription,
          productType: 'D', // Dropship product type
          typeOfProduct: originalProduct.typeOfProduct,
          typeProduct: originalProduct.typeProduct,

          // Dropshipping fields
          originalProductId,
          dropshipVendorId: req.user.id,
          originalVendorId: originalProduct.userId,
          dropshipMarkup: Number(markup),
          isDropshipped: true,
          isDropshipable: false, // Dropship products cannot be dropshipped again

          // Custom marketing content
          customMarketingContent: {
            marketingText: marketingText || '',
            originalName: originalProduct.productName,
            originalDescription: originalProduct.description,
          },

          // Additional marketing images
          additionalMarketingImages: additionalImages || [],

          // Set vendor as the dropship vendor
          userId: req.user.id,
          adminId: req.user.id,

          // Copy product images and add additional marketing images
          productImages: {
            create: [
              // Original product images
              ...originalProduct.productImages.map((img) => ({
                image: img.image,
                imageName: img.imageName,
                variant: img.variant,
              })),
              // Additional marketing images
              ...(additionalImages || []).map((img, index) => ({
                image: img,
                imageName: `marketing-${index + 1}.jpg`,
                variant: { type: 'marketing', index: index + 1 },
              })),
            ],
          },
        },
        include: {
          productImages: true,
          userBy: true,
          category: true,
          brand: true,
          placeOfOrigin: true,
          originalProduct: true,
        },
      });

      // Create product price entry
      await this.prisma.productPrice.create({
        data: {
          productId: dropshipProduct.id,
          productPrice: newPrice,
          offerPrice: newPrice,
          adminId: req.user.id,
          consumerType: 'EVERYONE',
          sellType: 'NORMALSELL',
          status: 'ACTIVE',
          stock: originalProduct.product_productPrice[0]?.stock || 0,
          deliveryAfter:
            originalProduct.product_productPrice[0]?.deliveryAfter || 1,
        },
      });

      // Notify admins about new dropshipable product
      try {
        await notifyAdminsDropshipableProduct(
          this.notificationService,
          dropshipProduct.id,
          dropshipProduct.productName,
          req.user.id,
          this.prisma,
        );
      } catch (notifError) {
      }

      return {
        status: true,
        message: 'Dropship product created successfully',
        data: dropshipProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  async getAvailableProductsForDropship(
    page: number,
    limit: number,
    term: string,
    categoryId: number,
    priceMin: number,
    priceMax: number,
    req: any,
  ) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        status: 'ACTIVE',
        productType: 'D', // Only show dropship products
        isDropshipable: true, // Only show products marked as dropshipable by vendor
        userId: { not: req.user.id }, // Exclude user's own products
        deletedAt: null, // Exclude soft-deleted products
      };

      if (term) {
        where.OR = [
          { productName: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ];
      }

      if (categoryId) {
        where.categoryId = categoryId;
      }

      if (priceMin || priceMax) {
        where.productPrice = {};
        if (priceMin) where.productPrice.gte = priceMin;
        if (priceMax) where.productPrice.lte = priceMax;
      }

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take: limit,
          include: {
            productImages: true,
            userBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
                companyAddress: true,
              },
            },
            category: true,
            brand: true,
            placeOfOrigin: true,
            product_productPrice: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);

      return {
        status: true,
        message: 'Products retrieved successfully',
        data: products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  async getDropshipProducts(
    page: number,
    limit: number,
    status: string,
    req: any,
  ) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        dropshipVendorId: req.user.id,
        isDropshipped: true,
        deletedAt: null, // Exclude soft-deleted products
      };

      if (status) {
        where.status = status;
      }

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take: limit,
          include: {
            productImages: true,
            originalProduct: {
              include: {
                userBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                  },
                },
                product_productPrice: true,
              },
            },
            category: true,
            brand: true,
            placeOfOrigin: true,
            product_productPrice: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);

      return {
        status: true,
        message: 'Dropship products retrieved successfully',
        data: products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  async getDropshipEarnings(req: any) {
    try {
      // Get dropship products for the user
      const dropshipProducts = await this.prisma.product.findMany({
        where: {
          dropshipVendorId: req.user.id,
          isDropshipped: true,
        },
        include: {
          product_productPrice: true,
          orderProducts: {
            include: {
              orderProduct_order: true,
            },
          },
        },
        take: 500, // Safety cap for earnings calculation
      });

      // Calculate earnings
      let totalRevenue = 0;
      let totalMarkup = 0;
      let totalOrders = 0;

      const productBreakdown = dropshipProducts.map((product) => {
        const orders =
          product.orderProducts?.filter(
            (op) =>
              op.orderProduct_order?.orderStatus === 'COMPLETE' ||
              op.orderProduct_order?.orderStatus === 'PAID',
          ) || [];

        const productRevenue = orders.reduce(
          (sum, order) =>
            sum +
            Number(order.orderQuantity || 0) * Number(order.salePrice || 0),
          0,
        );

        const productMarkup = orders.reduce(
          (sum, order) =>
            sum +
            Number(order.orderQuantity || 0) *
              Number(product.dropshipMarkup || 0),
          0,
        );

        totalRevenue += productRevenue;
        totalMarkup += productMarkup;
        totalOrders += orders.length;

        return {
          id: product.id,
          name: product.productName,
          earnings: productMarkup,
          orders: orders.length,
          revenue: productRevenue,
        };
      });

      return {
        status: true,
        message: 'Dropship earnings retrieved successfully',
        data: {
          totalRevenue,
          markupEarnings: totalMarkup,
          ordersCount: totalOrders,
          productBreakdown,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  async updateDropshipProductStatus(id: number, status: string, req: any) {
    try {
      // Verify ownership
      const dropshipProduct = await this.prisma.product.findFirst({
        where: {
          id,
          dropshipVendorId: req.user.id,
          isDropshipped: true,
        },
      });

      if (!dropshipProduct) {
        return {
          status: false,
          message: 'Dropship product not found or access denied',
          data: null,
        };
      }

      // Update status
      const updatedProduct = await this.prisma.product.update({
        where: { id },
        data: { status: status as any },
        include: {
          productImages: true,
          originalProduct: true,
          category: true,
          brand: true,
        },
      });

      return {
        status: true,
        message: 'Dropship product status updated successfully',
        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  async deleteDropshipProduct(id: number, req: any) {
    try {
      // Verify the product exists and belongs to the user
      const dropshipProduct = await this.prisma.product.findFirst({
        where: {
          id,
          dropshipVendorId: req.user.id,
          isDropshipped: true,
        },
      });

      if (!dropshipProduct) {
        return {
          status: false,
          message:
            'Dropship product not found or you do not have permission to delete it',
          data: null,
        };
      }


      // Soft delete - just update the status and deletedAt timestamp
      const updatedProduct = await this.prisma.product.update({
        where: { id },
        data: {
          status: 'DELETE', // Mark as deleted
          deletedAt: new Date(), // Set deletion timestamp
        },
      });


      return {
        status: true,
        message: 'Dropship product deleted successfully',
        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  // Mark product as dropshipable
  async markProductAsDropshipable(
    productId: number,
    isDropshipable: boolean,
    settings: {
      dropshipCommission?: number;
      dropshipMinMarkup?: number;
      dropshipMaxMarkup?: number;
      dropshipSettings?: any;
    },
    req: any,
  ) {
    try {
      // Verify product ownership
      const product = await this.prisma.product.findFirst({
        where: {
          id: productId,
          userId: req.user.id,
          isDropshipped: false, // Can't make a dropshipped product dropshipable
          status: 'ACTIVE',
        },
      });

      if (!product) {
        return {
          status: false,
          message:
            'Product not found or you do not have permission to modify it',
        };
      }

      // Update product
      const updatedProduct = await this.prisma.product.update({
        where: { id: productId },
        data: {
          isDropshipable,
          dropshipCommission: settings.dropshipCommission,
          dropshipMinMarkup: settings.dropshipMinMarkup,
          dropshipMaxMarkup: settings.dropshipMaxMarkup,
          dropshipSettings: settings.dropshipSettings,
        },
      });

      return {
        status: true,
        message: `Product ${isDropshipable ? 'marked as dropshipable' : 'removed from dropshipping'}`,
        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to update product dropship settings',
        error: getErrorMessage(error),
      };
    }
  }

  // Get vendor's dropshipable products
  async getMyDropshipableProducts(page: number, limit: number, req: any) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        userId: req.user.id,
        isDropshipped: false, // Only original products
        status: 'ACTIVE' as const,
        deletedAt: null,
      };

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take: limit,
          include: {
            productImages: true,
            category: true,
            brand: true,
            product_productPrice: true,
            // Count how many vendors are dropshipping this product
            dropshipProducts: {
              where: {
                status: 'ACTIVE',
                deletedAt: null,
              },
              select: {
                id: true,
                dropshipVendorId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);

      // Add dropship statistics to each product
      const productsWithStats = products.map((product: any) => ({
        ...product,
        isDropshipable: product.isDropshipable || false,
        dropshipCommission: product.dropshipCommission,
        dropshipMinMarkup: product.dropshipMinMarkup,
        dropshipMaxMarkup: product.dropshipMaxMarkup,
        dropshipStats: {
          totalDropshippers: product.dropshipProducts?.length || 0,
          isActive: product.isDropshipable,
        },
      }));

      return {
        status: true,
        data: productsWithStats,
        totalCount: total,
        page,
        limit,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to get dropshipable products',
        error: getErrorMessage(error),
      };
    }
  }

  // Get dropship analytics for vendor
  async getDropshipAnalytics(req: any) {
    try {
      const userId = req.user.id;

      // Get total dropshipable products
      const totalDropshipableProducts = await this.prisma.product.count({
        where: {
          userId,
          isDropshipable: true,
          isDropshipped: false,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      // Get total vendors dropshipping my products
      const dropshippedByVendors = await this.prisma.product.findMany({
        where: {
          originalVendorId: userId,
          isDropshipped: true,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          dropshipVendorId: true,
        },
        distinct: ['dropshipVendorId'],
      });

      // Get total dropship products created from my products
      const totalDropshipProducts = await this.prisma.product.count({
        where: {
          originalVendorId: userId,
          isDropshipped: true,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      // Get revenue from dropshipping
      const dropshipRevenue = await this.prisma.product.findMany({
        where: {
          originalVendorId: userId,
          isDropshipped: true,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          orderProducts: {
            where: {
              status: 'ACTIVE',
              orderProductStatus: { in: ['DELIVERED', 'RECEIVED'] },
            },
            select: {
              orderQuantity: true,
              salePrice: true,
              purchasePrice: true,
            },
          },
        },
      });

      const totalRevenue = dropshipRevenue.reduce((sum, product) => {
        const productRevenue = product.orderProducts.reduce((pSum, order) => {
          return (
            pSum +
            Number(order.purchasePrice || 0) * Number(order.orderQuantity || 0)
          );
        }, 0);
        return sum + productRevenue;
      }, 0);

      const totalOrders = dropshipRevenue.reduce((sum, product) => {
        return sum + product.orderProducts.length;
      }, 0);

      return {
        status: true,
        data: {
          totalDropshipableProducts,
          totalDropshippers: dropshippedByVendors.length,
          totalDropshipProducts,
          totalRevenue,
          totalOrders,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to get dropship analytics',
        error: getErrorMessage(error),
      };
    }
  }

  // Bulk enable/disable dropshipping for products
  async bulkUpdateDropshipable(
    productIds: number[],
    isDropshipable: boolean,
    settings: any,
    req: any,
  ) {
    try {
      // Verify ownership of all products
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          userId: req.user.id,
          isDropshipped: false,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });

      if (products.length !== productIds.length) {
        return {
          status: false,
          message: 'Some products not found or you do not have permission',
        };
      }

      // Update all products
      const result = await this.prisma.product.updateMany({
        where: {
          id: { in: productIds },
          userId: req.user.id,
        },
        data: {
          isDropshipable,
          dropshipCommission: settings.dropshipCommission,
          dropshipMinMarkup: settings.dropshipMinMarkup,
          dropshipMaxMarkup: settings.dropshipMaxMarkup,
          updatedAt: new Date(),
        },
      });

      return {
        status: true,
        message: `${result.count} products updated successfully`,
        data: { updatedCount: result.count },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to bulk update products',
        error: getErrorMessage(error),
      };
    }
  }

  // Get wholesale products (productType='D' and isDropshipable=true)
  async getWholesaleProducts(page: number, limit: number, req: any) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        userId: req.user.id,
        productType: 'D', // Only wholesale/dropship products
        isDropshipped: false, // Only original wholesale products
        isDropshipable: true, // Only dropshipable
        status: 'ACTIVE' as const,
        deletedAt: null,
      };

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take: limit,
          include: {
            productImages: true,
            category: true,
            brand: true,
            product_productPrice: true,
            // Get resellers who are selling this product
            dropshipProducts: {
              where: {
                isDropshipped: true,
                status: 'ACTIVE',
                deletedAt: null,
              },
              include: {
                dropshipVendor: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    email: true,
                  },
                },
                orderProducts: {
                  where: {
                    status: 'ACTIVE',
                    orderProductStatus: { in: ['DELIVERED', 'RECEIVED'] },
                  },
                  select: {
                    orderQuantity: true,
                    salePrice: true,
                    purchasePrice: true,
                    orderProductDate: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);

      // Add sales statistics to each product
      const productsWithStats = products.map((product: any) => {
        const resellers = product.dropshipProducts || [];
        const totalOrders = resellers.reduce(
          (sum: number, reseller: any) =>
            sum + (reseller.orderProducts?.length || 0),
          0,
        );
        const totalRevenue = resellers.reduce(
          (sum: number, reseller: any) =>
            reseller.orderProducts?.reduce(
              (orderSum: number, order: any) =>
                orderSum +
                Number(order.purchasePrice || 0) *
                  Number(order.orderQuantity || 0),
              0,
            ) || 0,
          0,
        );

        return {
          ...product,
          wholesaleStats: {
            totalResellers: resellers.length,
            totalOrders,
            totalRevenue,
            resellers: resellers.map((r: any) => ({
              id: r.dropshipVendor?.id,
              name:
                r.dropshipVendor?.companyName ||
                `${r.dropshipVendor?.firstName} ${r.dropshipVendor?.lastName}`.trim(),
              email: r.dropshipVendor?.email,
              orders: r.orderProducts?.length || 0,
              revenue:
                r.orderProducts?.reduce(
                  (sum: number, order: any) =>
                    sum +
                    Number(order.purchasePrice || 0) *
                      Number(order.orderQuantity || 0),
                  0,
                ) || 0,
            })),
          },
        };
      });

      return {
        status: true,
        data: productsWithStats,
        totalCount: total,
        page,
        limit,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to get wholesale products',
        error: getErrorMessage(error),
      };
    }
  }

  // Get wholesale dashboard analytics
  async getWholesaleDashboard(req: any) {
    try {
      const userId = req.user.id;

      // Get all wholesale products (capped to prevent unbounded queries)
      const wholesaleProducts = await this.prisma.product.findMany({
        where: {
          userId,
          productType: 'D',
          isDropshipable: true,
          isDropshipped: false,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          dropshipProducts: {
            where: {
              isDropshipped: true,
              status: 'ACTIVE',
              deletedAt: null,
            },
            include: {
              dropshipVendor: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  companyName: true,
                  email: true,
                },
              },
              orderProducts: {
                where: {
                  status: 'ACTIVE',
                  orderProductStatus: { in: ['DELIVERED', 'RECEIVED'] },
                },
                select: {
                  orderQuantity: true,
                  salePrice: true,
                  purchasePrice: true,
                  orderProductDate: true,
                },
              },
            },
          },
        },
        take: 500, // Safety cap for dashboard analytics
      });

      // Calculate overall statistics
      const totalWholesaleProducts = wholesaleProducts.length;

      const allResellers = new Set();
      let totalOrders = 0;
      let totalRevenue = 0;
      const resellerSales: any = {};

      wholesaleProducts.forEach((product: any) => {
        product.dropshipProducts?.forEach((dropship: any) => {
          const resellerId = dropship.dropshipVendorId;
          allResellers.add(resellerId);

          if (!resellerSales[resellerId]) {
            resellerSales[resellerId] = {
              id: resellerId,
              name:
                dropship.dropshipVendor?.companyName ||
                `${dropship.dropshipVendor?.firstName} ${dropship.dropshipVendor?.lastName}`.trim(),
              email: dropship.dropshipVendor?.email,
              orders: 0,
              revenue: 0,
              products: 0,
            };
          }

          const orderCount = dropship.orderProducts?.length || 0;
          const revenue =
            dropship.orderProducts?.reduce(
              (sum: number, order: any) =>
                sum +
                Number(order.purchasePrice || 0) *
                  Number(order.orderQuantity || 0),
              0,
            ) || 0;

          totalOrders += orderCount;
          totalRevenue += revenue;
          resellerSales[resellerId].orders += orderCount;
          resellerSales[resellerId].revenue += revenue;
          resellerSales[resellerId].products += 1;
        });
      });

      // Sort resellers by revenue
      const topResellers = Object.values(resellerSales)
        .sort((a: any, b: any) => b.revenue - a.revenue)
        .slice(0, 10);

      // Get best selling products
      const bestSellingProducts = wholesaleProducts
        .map((product: any) => {
          const totalProductOrders =
            product.dropshipProducts?.reduce(
              (sum: number, r: any) => sum + (r.orderProducts?.length || 0),
              0,
            ) || 0;
          const totalProductRevenue =
            product.dropshipProducts?.reduce(
              (sum: number, r: any) =>
                r.orderProducts?.reduce(
                  (orderSum: number, order: any) =>
                    orderSum +
                    Number(order.purchasePrice || 0) *
                      Number(order.orderQuantity || 0),
                  0,
                ) || 0,
              0,
            ) || 0;

          return {
            id: product.id,
            productName: product.productName,
            wholesalePrice: product.productPrice,
            totalOrders: totalProductOrders,
            totalRevenue: totalProductRevenue,
            resellers: product.dropshipProducts?.length || 0,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);

      return {
        status: true,
        data: {
          summary: {
            totalWholesaleProducts,
            totalActiveResellers: allResellers.size,
            totalOrders,
            totalRevenue,
          },
          topResellers,
          bestSellingProducts,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to get wholesale dashboard',
        error: getErrorMessage(error),
      };
    }
  }

  // Get sales by reseller for a specific wholesale product
  async getWholesaleProductSales(productId: number, req: any) {
    try {
      const wholesaleProduct = await this.prisma.product.findFirst({
        where: {
          id: productId,
          userId: req.user.id,
          productType: 'D',
          isDropshipable: true,
          isDropshipped: false,
          status: 'ACTIVE',
        },
        include: {
          product_productPrice: true,
          dropshipProducts: {
            where: {
              isDropshipped: true,
              status: 'ACTIVE',
              deletedAt: null,
            },
            include: {
              dropshipVendor: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  companyName: true,
                  email: true,
                  phoneNumber: true,
                },
              },
              orderProducts: {
                where: {
                  status: 'ACTIVE',
                },
                include: {
                  orderProduct_order: {
                    select: {
                      orderNo: true,
                      orderDate: true,
                      orderStatus: true,
                    },
                  },
                },
                orderBy: {
                  orderProductDate: 'desc',
                },
              },
            },
          },
        },
      });

      if (!wholesaleProduct) {
        return {
          status: false,
          message: 'Wholesale product not found',
        };
      }

      // Format sales data by reseller
      const salesByReseller = wholesaleProduct.dropshipProducts.map(
        (dropship: any) => {
          const orders = dropship.orderProducts || [];
          const totalOrders = orders.length;
          const totalQuantity = orders.reduce(
            (sum: number, order: any) => sum + Number(order.orderQuantity || 0),
            0,
          );
          const wholesaleRevenue = orders.reduce(
            (sum: number, order: any) =>
              sum +
              Number(order.purchasePrice || 0) *
                Number(order.orderQuantity || 0),
            0,
          );
          const resellerRevenue = orders.reduce(
            (sum: number, order: any) =>
              sum +
              Number(order.salePrice || 0) * Number(order.orderQuantity || 0),
            0,
          );
          const resellerProfit = resellerRevenue - wholesaleRevenue;

          return {
            reseller: {
              id: dropship.dropshipVendor.id,
              name:
                dropship.dropshipVendor.companyName ||
                `${dropship.dropshipVendor.firstName} ${dropship.dropshipVendor.lastName}`.trim(),
              email: dropship.dropshipVendor.email,
              phoneNumber: dropship.dropshipVendor.phoneNumber,
            },
            dropshipProductId: dropship.id,
            resalePrice: dropship.productPrice,
            totalOrders,
            totalQuantity,
            wholesaleRevenue,
            resellerRevenue,
            resellerProfit,
            recentOrders: orders.slice(0, 5).map((order: any) => ({
              orderNo: order.orderProduct_order?.orderNo,
              orderDate: order.orderProductDate,
              quantity: order.orderQuantity,
              status: order.orderProductStatus,
              wholesaleAmount:
                Number(order.purchasePrice || 0) *
                Number(order.orderQuantity || 0),
              resaleAmount:
                Number(order.salePrice || 0) * Number(order.orderQuantity || 0),
            })),
          };
        },
      );

      return {
        status: true,
        data: {
          product: {
            id: wholesaleProduct.id,
            productName: wholesaleProduct.productName,
            wholesalePrice: wholesaleProduct.productPrice,
            stock: wholesaleProduct.product_productPrice?.[0]?.stock || 0,
          },
          salesByReseller,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to get wholesale product sales',
        error: getErrorMessage(error),
      };
    }
  }

  // Get user's own dropshipable products (productType = D, isDropshipable = true)
  async getUserOwnDropshipableProducts(
    page: number,
    limit: number,
    req: any,
    term?: string,
    brandIds?: string,
    categoryIds?: string,
    status?: string,
    sort?: string,
  ) {
    try {
      const adminId = req?.user?.id;

      if (!adminId) {
        return {
          status: false,
          message: 'Unauthorized',
          data: [],
          totalCount: 0,
        };
      }

      const Page = parseInt(String(page)) || 1;
      const pageSize = parseInt(String(limit)) || 10;
      const skip = (Page - 1) * pageSize;
      const searchTerm = term && term.length > 2 ? term : '';
      const sortType = sort === 'ASC' ? 'asc' : 'desc';

      // Build where condition
      let whereCondition: any = {
        userId: adminId,
        productType: 'D',
        isDropshipable: true, // Products the user has marked as available for dropshipping
        status: { not: 'DELETE' },
        deletedAt: null,
        productName: searchTerm
          ? {
              contains: searchTerm,
              mode: 'insensitive',
            }
          : undefined,
      };

      // Add brand filter
      if (brandIds) {
        whereCondition.brandId = {
          in: brandIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      // Add category filter
      if (categoryIds) {
        whereCondition.categoryId = {
          in: categoryIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      // Get products with their relations
      const products = await this.prisma.product.findMany({
        where: whereCondition,
        include: {
          productImages: {
            where: { status: 'ACTIVE' },
          },
          product_productShortDescription: {
            where: { status: 'ACTIVE' },
          },
          product_productSpecification: {
            where: { status: 'ACTIVE' },
          },
          product_productPrice: {
            where: {
              status: { not: 'DELETE' },
            },
            include: {
              productPrice_productSellerImage: true,
            },
          },
          brand: true,
          category: true,
          productTags: {
            include: {
              productTagsTag: true,
            },
          },
          product_wishlist: true,
        },
        orderBy: { createdAt: sortType },
        skip,
        take: pageSize,
      });

      // Get total count
      const totalCount = await this.prisma.product.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: products,
        totalCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching user own dropship products',
        error: getErrorMessage(error),
        data: [],
        totalCount: 0,
      };
    }
  }

  // Get dropship products created from a specific original product
  async getDropshipProductsFromOriginal(originalProductId: number) {
    try {
      const dropshipProducts = await this.prisma.product.findMany({
        where: {
          originalProductId: originalProductId,
          isDropshipped: true,
          status: { not: 'DELETE' },
          deletedAt: null,
        },
        include: {
          productImages: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
          product_productPrice: {
            where: { status: { not: 'DELETE' } },
            take: 1,
          },
          brand: true,
          category: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get user information for each product separately
      const productsWithUserInfo = await Promise.all(
        dropshipProducts.map(async (product) => {
          const user = await this.prisma.user.findUnique({
            where: { id: product.userId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              companyName: true,
              email: true,
              accountName: true,
            },
          });

          return {
            ...product,
            user: user,
          };
        }),
      );

      return {
        status: true,
        message: 'Dropship products retrieved successfully',
        data: productsWithUserInfo,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching dropship products',
        error: getErrorMessage(error),
        data: [],
      };
    }
  }

  /**
   * Generate product data using AI (OpenRouter)
   * Supports text, image, and URL inputs
   */
  async generateProductWithAI(type: string, input: string | MulterFile): Promise<any> {
    try {
      let result;

      if (type === 'text' && typeof input === 'string') {
        result = await this.openRouterService.generateFromText(input);
      } else if (type === 'image' && input instanceof Object) {
        result = await this.openRouterService.generateFromImage(input as MulterFile);
      } else if (type === 'url' && typeof input === 'string') {
        result = await this.openRouterService.generateFromUrl(input);
      } else {
        return {
          status: false,
          message: 'Invalid input type. Expected text, image, or url.',
        };
      }

      if (result.success) {
        return {
          status: true,
          data: result.data,
        };
      } else {
        return {
          status: false,
          message: result.message || 'Failed to generate product data',
        };
      }
    } catch (error: any) {
      return {
        status: false,
        message: getErrorMessage(error) || 'Failed to generate product data',
      };
    }
  }

  /**
   * Match AI-generated category with existing platform categories using AI
   */
  async matchCategoryWithAI(aiCategoryName: string, availableCategories: Array<{ id: number; name: string; isLeaf?: boolean }>, productName?: string): Promise<any> {
    try {
      const result = await this.openRouterService.matchCategory(aiCategoryName, availableCategories, productName);
      return {
        status: true,
        data: result,
      };
    } catch (error: any) {
      return {
        status: false,
        message: getErrorMessage(error) || 'Failed to match category',
      };
    }
  }

  /**
   * Generate lightweight product list (name, category, price, variants only)
   */
  async generateProductList(type: string, input: string | MulterFile): Promise<any> {
    try {
      if (type === 'text' && typeof input === 'string') {
        const result = await this.openRouterService.generateProductList(input);
        return {
          status: result.success,
          data: result.data,
          message: result.message,
        };
      } else {
        return {
          status: false,
          message: 'Product list generation currently only supports text input',
        };
      }
    } catch (error: any) {
      return {
        status: false,
        message: getErrorMessage(error) || 'Failed to generate product list',
      };
    }
  }

  /**
   * Check if a product model exists in existing products table
   */
  async checkModelExists(modelName: string, req: any): Promise<any> {
    try {
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          exists: false,
        };
      }

      // Search for existing product with similar name (case-insensitive, partial match)
      const existingProduct = await this.prisma.existingProduct.findFirst({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          productName: {
            contains: modelName,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          productName: true,
        },
      });

      return {
        status: true,
        exists: !!existingProduct,
        existingProduct: existingProduct || null,
      };
    } catch (error: any) {
      return {
        status: false,
        message: getErrorMessage(error) || 'Failed to check model existence',
        exists: false,
      };
    }
  }

  /**
   * Generate full product details for a selected product
   */
  async generateProductDetails(productName: string, category?: string, brand?: string): Promise<any> {
    try {
      // Fetch available categories for matching (root product category ID is 4)
      const categories = await this.prisma.category.findMany({
        where: {
          parentId: 4, // PRODUCT_CATEGORY_ID
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      const result = await this.openRouterService.generateProductDetails(
        productName,
        category,
        brand,
        categories,
      );
      return {
        status: result.success,
        data: result.data,
        message: result.message,
      };
    } catch (error: any) {
      return {
        status: false,
        message: getErrorMessage(error) || 'Failed to generate product details',
      };
    }
  }
}
