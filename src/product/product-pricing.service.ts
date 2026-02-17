/**
 * @file product-pricing.service.ts
 * @description Extracted pricing logic from the monolithic ProductService.
 *   Handles all product-price CRUD, bulk operations (hide/show, condition,
 *   discount, where-to-sell, ask-for), and price-change/stock-change notifications.
 *
 * @module ProductPricingService
 * @phase B13 - Product Service Decomposition Part 1
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';
import { NotificationService } from 'src/notification/notification.service';
import { UpdatedProductPriceDto } from './dto/update-productPrice.dto';
import { AddMultiplePriceForProductDTO } from './dto/addMultiple-productPrice.dto';
import { UpdateMultiplePriceForProductDTO } from './dto/updateMultiple-productPrice.dto';

@Injectable()
export class ProductPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper: generates a barcode for a product price entry.
   * Kept here to avoid circular dependency with the media service.
   */
  private async generateBarcodeForProductPrice(
    productId: string,
    productPriceId: string,
    adminId: string,
  ) {
    const bwipjs = require('bwip-js');
    const barcodeData = `${productId}-${productPriceId}-${adminId}`;

    const barcodeOptions = {
      bcid: 'code128',
      text: barcodeData,
      scale: 3,
      height: 10,
      includetext: true,
    };

    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(barcodeOptions, (err, png) => {
        if (err) {
          reject(err);
        } else {
          const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
          resolve(dataUrl);
        }
      });
    });
  }

  /**
   * @method addPriceForProduct
   * @description Creates a single seller-specific price entry for a product.
   */
  async addPriceForProduct(payload: any, req: any) {
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
   * @description Creates multiple seller-specific price entries in one request.
   */
  async addMultiplePriceForProduct(
    payload: AddMultiplePriceForProductDTO,
    req: any,
  ) {
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
   *   Sends stock/price change notifications to wishlist users.
   */
  async updateMultipleProductPrice(
    payload: UpdateMultiplePriceForProductDTO,
    req: any,
  ) {
    try {
      const adminId = req?.user?.id;
      const productPriceList = [];

      if (payload?.productPrice && payload?.productPrice.length > 0) {
        for (let i = 0; i < payload?.productPrice.length; i++) {
          let existProductPrice = await this.prisma.productPrice.findUnique({
            where: { id: payload?.productPrice[i].productPriceId },
          });

          if (existProductPrice) {
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
                productPrice: payload?.productPrice[i]?.productPrice,
                offerPrice: payload?.productPrice[i]?.offerPrice,
                stock: payload?.productPrice[i]?.stock,
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

            // Stock change notifications
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

            // Price change notifications
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
   */
  async bulkHideShowProducts(
    payload: { productPriceIds: number[]; hide: boolean },
    req: any,
  ) {
    try {
      const { productPriceIds, hide } = payload;
      const status = hide ? 'HIDDEN' : 'ACTIVE';

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
   */
  async bulkProductCondition(
    payload: { productPriceIds: number[]; productCondition: string },
    req: any,
  ) {
    try {
      const { productPriceIds, productCondition } = payload;

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
   * @description Updates discount settings for multiple product-price records.
   */
  async bulkDiscountUpdate(
    payload: { productPriceIds: number[]; discountData: any },
    req: any,
  ) {
    try {
      const { productPriceIds, discountData } = payload;

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

      const updateData: any = {};

      if (discountData.consumerType)
        updateData.consumerType = discountData.consumerType;
      if (discountData.sellType) updateData.sellType = discountData.sellType;
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
      if (discountData.vendorDiscountType)
        updateData.vendorDiscountType = discountData.vendorDiscountType;
      if (discountData.consumerDiscountType)
        updateData.consumerDiscountType = discountData.consumerDiscountType;

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
   * @description Updates geographic sell regions for multiple product-price records.
   */
  async bulkWhereToSellUpdate(
    payload: { productPriceIds: number[]; locationData: any },
    req: any,
  ) {
    try {
      const { productPriceIds, locationData } = payload;

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

      let updateCount = 0;

      for (const productPriceId of validProductPriceIds) {
        const productPrice = await this.prisma.productPrice.findUnique({
          where: { id: productPriceId },
          select: { id: true, productId: true },
        });

        if (!productPrice || !productPrice.productId) {
          continue;
        }

        const productId = productPrice.productId;

        if (
          locationData.sellCountryIds &&
          locationData.sellCountryIds.length > 0
        ) {
          await this.prisma.productSellCountry.deleteMany({
            where: {
              productId: productId,
              productPriceId: productPriceId,
            },
          });

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

        if (locationData.sellStateIds && locationData.sellStateIds.length > 0) {
          await this.prisma.productSellState.deleteMany({
            where: {
              productId: productId,
              productPriceId: productPriceId,
            },
          });

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

        if (locationData.sellCityIds && locationData.sellCityIds.length > 0) {
          await this.prisma.productSellCity.deleteMany({
            where: {
              productId: productId,
              productPriceId: productPriceId,
            },
          });

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
   * @description Updates "ask for" flags for multiple product-price records.
   */
  async bulkAskForUpdate(
    payload: { productPriceIds: number[]; askForData: any },
    req: any,
  ) {
    try {
      const { productPriceIds, askForData } = payload;

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

      const updateData: any = {};

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
   * @description Retrieves all product-price entries owned by the authenticated user.
   */
  async getAllProductPriceByUser(
    page: any,
    limit: any,
    req: any,
    term: any,
    brandIds: any,
  ) {
    try {
      let adminId = req?.user?.id;

      if (req?.query?.selectedAdminId) {
        adminId = parseInt(req.query.selectedAdminId);
      }

      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 2 ? term : '';
      const sortType = 'desc';
      let today = new Date();

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

      if (req.query.expireDate === 'active') {
        whereCondition.dateClose = { gte: today };
      } else if (req.query.expireDate === 'expired') {
        whereCondition.dateClose = { lt: today };
      }

      const sellTypes = req.query.sellType
        ? req.query.sellType.split(',').map((type) => type.trim())
        : null;

      if (sellTypes) {
        whereCondition.sellType = { in: sellTypes };
      }

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
        skip,
        take: pageSize,
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
   * @method updateProductPrice
   * @description Updates a single product-price record with full field support,
   *   including stock/price change notifications.
   */
  async updateProductPrice(
    updatedProductPriceDto: UpdatedProductPriceDto,
    req: any,
  ) {
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
          adminId: adminId,
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

      const productId = existProductPrice.productId;

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

      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { productName: true },
      });

      // Stock change notifications
      if (oldStock !== newStock && product) {
        try {
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

      // Price change notifications
      if (oldOfferPrice !== newOfferPrice && product && oldOfferPrice > 0) {
        try {
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

  /**
   * @method getOneProductPrice
   * @description Retrieves a single product-price record by primary key.
   */
  async getOneProductPrice(productPriceId: any) {
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
   * @description Soft-deletes a single product-price record.
   */
  async deleteOneProductPrice(productPriceId: any) {
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
}
