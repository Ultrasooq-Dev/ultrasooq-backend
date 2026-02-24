/**
 * @file order.service.ts
 * @description Core business-logic service for the Order domain in the Ultrasooq
 *   B2B/B2C marketplace backend.
 *
 * Intent:
 *   Encapsulates every operation related to order lifecycle management:
 *   creation (authenticated and guest), listing (buyer-side and seller-side),
 *   status transitions, cancellation, pre-order price calculation, fee/commission
 *   computation, sales analytics, and shipping/delivery management.
 *
 * Idea:
 *   Operates as a single Injectable service consumed by OrderController.
 *   All database access goes through a module-scoped PrismaClient instance.
 *   Methods uniformly return a `{ status, message, data, ... }` response envelope.
 *   Errors are caught at the method level and returned as `{ status: false }`.
 *
 * Usage:
 *   Injected into OrderController via NestJS DI. Each public method maps 1:1 to
 *   a controller endpoint. The private `calculateFees()` helper is shared by
 *   `createOrder2()` and `preOrderCal()`.
 *
 * Data Flow:
 *   Controller -> OrderService method -> PrismaClient queries/mutations -> DB
 *   Side-effects: NotificationService (emails), HelperService (admin resolution)
 *
 * Dependencies:
 *   - PrismaClient (module-scoped, not injected)
 *   - NotificationService : Email notifications (guest user welcome)
 *   - HelperService       : getAdminId() for team-member -> admin resolution
 *   - randomstring        : Order number generation (Ord_, Ords_ prefixes)
 *   - bcrypt (genSalt, hash) : Password hashing for guest user creation
 *   - moment              : Date manipulation for sales-by-month analytics
 *   - Decimal (@prisma/client/runtime) : Precise fee arithmetic
 *
 * Notes:
 *   - The Prisma Decimal type is used for all fee calculations to avoid
 *     floating-point precision errors.
 *   - Trade roles (BUYER, COMPANY, FREELANCER, MEMBER) determine discount
 *     and fee logic branching.
 *   - consumerType on ProductPrice (CONSUMER, VENDORS, EVERYONE) controls
 *     which buyer trade roles may purchase a given product.
 *   - Fee types are either GLOBAL (one fee structure per menu) or NONGLOBAL
 *     (location-specific fees matched by country/state/city).
 */
import { Injectable } from '@nestjs/common';
import * as randomstring from 'randomstring';
import { compare, hash, genSalt } from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { NotificationService } from 'src/notification/notification.service';
const { Decimal } = Prisma;

import * as moment from 'moment';
import { HelperService } from 'src/helper/helper.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * @class OrderService
 * @description Injectable service providing all order-related business logic for the
 *   Ultrasooq marketplace. Handles authenticated and guest order creation, buyer/seller
 *   order listing, status management, cancellation, pre-order calculations,
 *   fee/commission computation, sales analytics, and shipping operations.
 */
@Injectable()
export class OrderService {
  private autoConfirmInterval: NodeJS.Timeout | null = null;

  /**
   * @constructor
   * @param {NotificationService} notificationService - Service for sending order-related
   *   email notifications (e.g. guest user welcome email on checkout).
   * @param {HelperService} helperService - Utility service; primarily used for
   *   getAdminId() which resolves a team member's ID to their parent admin ID.
   *
   * Intent:    Wire up injected dependencies for notification and admin resolution.
   * Data Flow: Both services are used as side-effect providers within order methods.
   */
  constructor(
    private readonly notificationService: NotificationService,
    private readonly helperService: HelperService,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {
    // Initialize auto-confirm scheduler once
    if (!this.autoConfirmInterval) {
      this.autoConfirmInterval = setInterval(() => {
        this.autoConfirmBuygroupOrdersOnStockOut().catch(() => {});
      }, 5 * 60 * 1000);
    }
  }

  /**
   * @method createOrder2
   * @description Creates a full order for an authenticated buyer, handling both
   *   product and service cart items.
   *
   * Intent:
   *   Primary order-creation flow for logged-in users. Processes cart items,
   *   validates trade-role eligibility, applies discounts, computes platform fees,
   *   deducts stock, persists the order hierarchy, creates payment transactions,
   *   and clears the buyer's cart.
   *
   * Idea:
   *   1. Merge product and service cart IDs; fetch cart-product-service relations.
   *   2. Determine buyer type (VENDOR vs CONSUMER) from user tradeRole.
   *   3. For each product cart item:
   *      a. Validate trade-role eligibility against consumerType.
   *      b. Apply vendor or consumer discounts (FLAT / PERCENTAGE).
   *      c. Deduct stock; skip if out-of-stock.
   *      d. Calculate fees via this.calculateFees().
   *   4. For each service cart item:
   *      a. Aggregate service feature costs (FLAT / HOURLY).
   *   5. Create the Order record with totals.
   *   6. Optionally create OrderEMI if paymentType is EMI.
   *   7. Group products by sellerId; create OrderSeller, OrderShipping, and
   *      OrderProducts per seller.
   *   8. Link cart-product-service relations to OrderProductService.
   *   9. Save billing and shipping OrderAddress records.
   *  10. Create a TransactionPaymob record.
   *  11. Clear the user's cart (CartServiceFeature, CartProductService, Cart).
   *
   * Usage:
   *   Called by OrderController.createOrder(). Requires an authenticated request.
   *
   * Data Flow:
   *   payload (cartIds, serviceCartIds, addresses, payment) + req.user.id
   *   -> cart lookup -> product price lookup -> discount logic -> stock deduction
   *   -> fee calculation -> order/orderSeller/orderProducts/orderAddress/transaction writes
   *   -> cart cleanup -> response envelope
   *
   * Dependencies:
   *   - PrismaClient (cart, user, productPrice, order, orderSeller, orderShipping,
   *     orderProducts, orderProductService, orderAddress, transactionPaymob,
   *     cartServiceFeature, cartProductService, orderEMI)
   *   - this.calculateFees() : Platform fee computation
   *   - randomstring : Generates order numbers (Ord_, Ords_ prefixes)
   *
   * Notes:
   *   - Products that fail trade-role validation are collected in `invalidProducts`.
   *   - Products that fail stock or fee validation are collected in `productCannotBuy`.
   *   - For SERVICE order-product types with serviceConfirmType === 'AUTO', the
   *     orderProductStatus is set to CONFIRMED automatically.
   *   - The entire user cart is deleted after order creation (not just the
   *     ordered items).
   *
   * @param {any} payload - Request body with cartIds, serviceCartIds, userAddressId,
   *   shipping array, billing/shipping address fields, paymentMethod, paymentType,
   *   advanceAmount, dueAmount, emiInstallmentCount, emiInstallmentAmount, etc.
   * @param {any} req - Express request; req.user.id is the authenticated buyer.
   * @returns {Promise<object>} Envelope with status, order details, product list,
   *   pricing totals, invalidProducts, productCannotBuy, and transaction info.
   */
  // in use
  async createOrder2(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const userAddressId = payload?.userAddressId

      // Check if this is an RFQ order
      const isRfqOrder = payload.rfqQuotesId && payload.rfqQuotesUserId;
      
      if (isRfqOrder) {
        return await this.createOrderFromRfqQuote(payload, req);
      }

      let totalCartIds = [
        ...(payload.cartIds || []),
        ...(payload.serviceCartIds || [])
      ];

      let cartProductServiceRelation = await this.prisma.cartProductService.findMany({
        where: {
          OR: [
            { cartId: { in: totalCartIds } },
            { relatedCartId: { in: totalCartIds } }
          ]
        }
      });

      // return {
      //   status: true,
      //   message: 'Created Successfully',
      //   data: cartProductServiceRelation
      // };

      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          customerId: true,
          userType: true,
          tradeRole: true
        }
      });
      if (!userDetail) {
        return { status: false, message: 'User not found', data: [] };
      }
      let userTradeRole = userDetail.tradeRole;

      const buyerType = ['COMPANY', 'FREELANCER'].includes(userTradeRole) ? 'VENDOR' : 'CONSUMER';

      let productList: any[] = [];
      let deliveryCharge = 0;
      let totalPrice = 0;
      let totalPurchasedPrice = 0;
      let discount = 0;
      let invalidProducts: any[] = [];
      let productCannotBuy: any[] = [];
      let totalCustomerPay = 0;
      let totalPlatformFee = 0;
      let totalCashbackToCustomer = 0;

      // Batch-fetch all cart items and their product prices to avoid N+1 queries
      const allCartDetails = await this.prisma.cart.findMany({
        where: { id: { in: payload.cartIds } },
        select: { id: true, productId: true, quantity: true, productPriceId: true, sharedLinkId: true, object: true }
      });
      const cartDetailsMap = new Map(allCartDetails.map(c => [c.id, c]));

      const allProductPriceIds = allCartDetails.map(c => c.productPriceId).filter((id): id is number => id !== null);
      const allProductPriceDetails = await this.prisma.productPrice.findMany({
        where: { id: { in: allProductPriceIds } },
      });
      const productPriceMap = new Map(allProductPriceDetails.map(p => [p.id, p]));

      for (let i = 0; i < payload.cartIds.length; i++) {
        let cartDetails = cartDetailsMap.get(payload.cartIds[i]);
        if (!cartDetails) continue;

        let productPriceDetails = productPriceMap.get(cartDetails.productPriceId);
        if (!productPriceDetails) continue;
        let menuId = productPriceDetails.menuId;
        
        // Note: consumerType is only used for discount calculations, not for purchase restrictions
        // All users can purchase any product regardless of consumerType

        let offerPrice = parseFloat(productPriceDetails.offerPrice.toString());
        let purchasedPrice = offerPrice;
        let discountAmount = 0;
        let discountApplied = false

        //  Apply Discounts
        if (productPriceDetails.consumerType === 'VENDORS' && ['COMPANY', 'FREELANCER'].includes(userTradeRole)) {

          if (productPriceDetails?.vendorDiscountType === 'FLAT') {
            discountAmount = parseFloat(productPriceDetails.vendorDiscount?.toString() || "0");
            purchasedPrice -= discountAmount;
            discountApplied = true;

          } else if (productPriceDetails?.vendorDiscountType === 'PERCENTAGE') {
            discountAmount = (offerPrice * parseFloat(productPriceDetails.vendorDiscount?.toString() || "0")) / 100;
            purchasedPrice -= discountAmount;
            discountApplied = true;
          }

        } else if (productPriceDetails.consumerType === 'CONSUMER' && userTradeRole === 'BUYER') {

          if (productPriceDetails?.consumerDiscountType === 'FLAT') {
            discountAmount = parseFloat(productPriceDetails.consumerDiscount?.toString() || "0");
            purchasedPrice -= discountAmount;
            discountApplied = true;

          } else if (productPriceDetails?.consumerDiscountType === 'PERCENTAGE') {
            discountAmount = (offerPrice * parseFloat(productPriceDetails.consumerDiscount?.toString() || "0")) / 100;
            purchasedPrice -= discountAmount;
            discountApplied = true;
          }

        } else if (productPriceDetails.consumerType === 'EVERYONE') {
          
          if (['COMPANY', 'FREELANCER'].includes(userTradeRole)) {
            if (productPriceDetails?.vendorDiscountType === 'FLAT') {
              discountAmount = parseFloat(productPriceDetails.vendorDiscount?.toString() || "0");
              purchasedPrice -= discountAmount;
              discountApplied = true;

            } else if (productPriceDetails?.vendorDiscountType === 'PERCENTAGE') {
              discountAmount = (offerPrice * parseFloat(productPriceDetails.vendorDiscount?.toString() || "0")) / 100;
              purchasedPrice -= discountAmount;
              discountApplied = true;

            }
          } else if (userTradeRole === 'BUYER') {

            if (productPriceDetails?.consumerDiscountType === 'FLAT') {
              discountAmount = parseFloat(productPriceDetails.consumerDiscount?.toString() || "0");
              purchasedPrice -= discountAmount;
              discountApplied = true;
  
            } else if (productPriceDetails?.consumerDiscountType === 'PERCENTAGE') {
              discountAmount = (offerPrice * parseFloat(productPriceDetails.consumerDiscount?.toString() || "0")) / 100;
              purchasedPrice -= discountAmount;
              discountApplied = true;
  
            }
          }
        }

        let quantity = cartDetails.quantity;
        let totalProductDiscount = discountAmount * quantity;

        // -------------------------------------------------------------- Updating Stock
        if (productPriceDetails.productId && productPriceDetails.id && quantity) {
          const productPriceDetail = await this.prisma.productPrice.findUnique({
            where: { id: productPriceDetails.id },
          });

          if (productPriceDetail) {
            if (productPriceDetail.stock >= quantity) {
              let updatedStock = productPriceDetail.stock - quantity;

              // Ensure stock doesn't go negative
              if (updatedStock < 0) {
                updatedStock = 0;
              }

              await this.prisma.productPrice.update({
                where: { id: productPriceDetails.id },
                data: {
                  stock: updatedStock,
                },
              });

            } else {
              productCannotBuy.push({
                productId: productPriceDetails.productId,
                productReasonMessage: "Out Of Stock"
              });
              continue;
            }
          } else {
            productCannotBuy.push({
              productId: productPriceDetails.productId,
              productReasonMessage: "Product Not Found"
            });
            continue;
          }
        }

        // fee calculation function (define separately)
        const feeResult = await this.calculateFees({
          userAddressId: userAddressId,
          menuId: menuId,
          buyerId: userId,
          buyerType: buyerType,
          productId: productPriceDetails.productId,
          productPriceId: productPriceDetails.id,
          quantity: quantity,
          purchasedPrice: purchasedPrice * quantity
        });

        const breakdown = feeResult.breakdown;
        const customerPay = Number(feeResult.customerPay);
        const cashbackToCustomer = feeResult.cashbackToCustomer;
        const sellerReceives = feeResult.sellerReceives;
        const platformProfit = feeResult.platformProfit;
        const productReasonMessage = feeResult.message;

        if (!feeResult || !feeResult.isValid) {
          productCannotBuy.push({
            productId: cartDetails.productId,
            productReasonMessage: productReasonMessage
          });
          continue;
        }

        productList.push({
          productPriceId: productPriceDetails.id,
          productId: productPriceDetails.productId,
          offerPrice: offerPrice, // actual price per
          purchasedPrice: purchasedPrice, // actual price after discount
          quantity: quantity,
          sellerId: productPriceDetails.adminId,
          discountApplied,
          discountAmount: discountAmount, // discount per quantity
          totalProductDiscount, // total discount on per product
          menuId: menuId,
          breakdown: breakdown,
          customerPay: customerPay,
          cashbackToCustomer: cashbackToCustomer,
          sellerReceives: sellerReceives,
          platformProfit: platformProfit,
          object: cartDetails.object,
          cartId: cartDetails.id,
          orderProductType: 'PRODUCT'
        });

        totalPrice += offerPrice * quantity;
        totalPurchasedPrice += purchasedPrice * quantity;
        discount += totalProductDiscount;

        totalCustomerPay += customerPay;
        totalPlatformFee += platformProfit;
        totalCashbackToCustomer += cashbackToCustomer;
      }

      // Batch-fetch all service cart items to avoid N+1 queries
      const allServiceCartDetails = await this.prisma.cart.findMany({
        where: { id: { in: payload.serviceCartIds } },
        include: {
          service: {
            include: {
              serviceFeatures: true
            }
          },
          cartServiceFeatures: {
            include: {
              serviceFeature: true
            }
          }
        }
      });
      const serviceCartMap = new Map(allServiceCartDetails.map(c => [c.id, c]));

      for (let j = 0; j < payload.serviceCartIds.length; j++) {
        const cartDetails = serviceCartMap.get(payload.serviceCartIds[j]);
        if (!cartDetails) continue;

        let totalPrice = 0;
        let quantity = 0;
        const breakdownList = [];

        for (let k = 0; k < cartDetails.cartServiceFeatures.length; k++) {

          const feature = cartDetails.cartServiceFeatures[k].serviceFeature;
          const cost = parseFloat(feature.serviceCost.toString());
          const serviceFeatureQuantity = cartDetails.cartServiceFeatures[k].quantity
          const bookingDateTime = cartDetails?.cartServiceFeatures[k]?.bookingDateTime;

          if (feature.serviceCostType === 'FLAT') {
            totalPrice += cost;
            quantity += serviceFeatureQuantity

            breakdownList.push({
              id: feature.id,
              name: feature.name,
              cost: cost,
              costType: feature.serviceCostType,
              quantity: serviceFeatureQuantity,
              bookingDateTime: bookingDateTime
            });

          } else if (feature.serviceCostType === 'HOURLY') {
            const hours = cartDetails.service.eachCustomerTime || 1;
            totalPrice += (cost * hours) * serviceFeatureQuantity;
            quantity = serviceFeatureQuantity;

            breakdownList.push({
              id: feature.id,
              name: feature.name,
              cost: cost * hours,
              costType: feature.serviceCostType,
              hours: hours,
              quantity: serviceFeatureQuantity,
              bookingDateTime: bookingDateTime
            });
          }
        }

        productList.push({
          orderProductType: 'SERVICE',
          serviceId: cartDetails.serviceId,
          productPriceId: null,
          productId: null,
          offerPrice: totalPrice / quantity,
          purchasedPrice: totalPrice / quantity,
          quantity: quantity,
          sellerId: cartDetails.service.sellerId,
          discountApplied: false,
          discountAmount: 0,
          totalProductDiscount: 0,
          menuId: null,
          breakdown: { serviceFeatures: breakdownList },
          customerPay: totalPrice,
          cashbackToCustomer: 0,
          sellerReceives: totalPrice,
          platformProfit: 0,
          object: cartDetails.object,
          cartId: cartDetails.id,
          orderProductStatus: "PLACED",
        });

        totalCustomerPay += totalPrice;
      }

      // return {
      //   status: true,
      //   message: 'Created Successfully',
      //   data: cartProductServiceRelation,
      //   productList: productList
      // };

      const uniqueSellerIds = [...new Set(productList.map(item => item.sellerId))];

      let isShipping = false;
      if (payload.shipping && payload.shipping.length > 0) {
        // Step 1: Extract sellerIds from shipping
        const shippingSellerIds = payload.shipping.map(item => item.sellerId);

        // Step 2: Find sellerIds which do not exist in uniqueSellerIds
        const mismatchedSellers = shippingSellerIds
          .filter(sellerId => !uniqueSellerIds.includes(sellerId))
          .map(sellerId => ({
            sellerId,
            message: "This sellerId does not match with product sellerId"
          }));

        isShipping = true;

        // Step 3: If any mismatch found, return warning
        if (mismatchedSellers.length > 0) {
          return {
            status: false,
            mismatchedSellers,
          }
        }
      }
      
      // order create
      let orderDetails = await this.prisma.order.create({
        data: {
          userId: userId,
          totalPrice: totalPrice,
          actualPrice: totalPurchasedPrice,
          totalDiscount: discount,
          totalCustomerPay: totalCustomerPay,
          totalPlatformFee: totalPlatformFee,
          totalCashbackToCustomer: totalCashbackToCustomer,
          paymentMethod: payload?.paymentMethod,
          deliveryCharge: payload?.deliveryCharge || null,
          orderDate: new Date(),
          orderNo: "Ord_" + randomstring.generate({length: 12, charset: "alphanumeric",}),

          paymentType: payload?.paymentType || 'DIRECT',
          advanceAmount: payload?.advanceAmount,
          dueAmount: payload?.dueAmount
        }
      });

      // Handle wallet payment
      let walletTransactionId: number | null = null;
      if (payload?.paymentMethod === 'WALLET') {
        try {
          const userAccountId = req?.user?.userAccountId;
          const walletPaymentResult = await this.walletService.processWalletPayment(
            userId,
            totalCustomerPay,
            orderDetails.id,
            userAccountId
          );
          
          if (!walletPaymentResult.status) {
            // If wallet payment fails, delete the order and return error
            await this.prisma.order.delete({
              where: { id: orderDetails.id }
            });
            
            return {
              status: false,
              message: 'Wallet payment failed',
              error: walletPaymentResult.message
            };
          }

          // Store wallet transaction ID separately
          walletTransactionId = walletPaymentResult.transactionId || null;
          await this.prisma.order.update({
            where: { id: orderDetails.id },
            data: {
              walletTransactionId: walletTransactionId as any, // Type assertion for new field
              paymentMethod: 'WALLET'
            } as any
          });
        } catch (error) {
          // If wallet payment fails, delete the order and return error
          await this.prisma.order.delete({
            where: { id: orderDetails.id }
          });
          
          return {
            status: false,
            message: 'Wallet payment failed',
            error: getErrorMessage(error)
          };
        }
      }

      let newOrderEMI;
      if (payload?.paymentType === 'EMI') {
        const nextEmiDueDate = new Date();
        nextEmiDueDate.setDate(nextEmiDueDate.getDate() + 30); // Adds 30 days to today

        newOrderEMI = await this.prisma.orderEMI.create({
          data: {
            orderId: orderDetails.id,
            emiInstallmentCount: payload?.emiInstallmentCount,
            emiInstallmentAmount: payload?.emiInstallmentAmount,
            emiInstallmentAmountCents: payload?.emiInstallmentAmountCents,
            emiStartDate: new Date(),
            emiInstallmentsPaid: 1,
            emiStatus: 'ONGOING',
            nextEmiDueDate: nextEmiDueDate,
          }
        });
      }



      for (let sellerId of uniqueSellerIds) {
        const sellerOrderNo = `Ords_${randomstring.generate({ length: 12, charset: 'alphanumeric' })}`;

        // order seller
        let addOrderSeller = await this.prisma.orderSeller.create({
          data: {
            orderId: orderDetails.id,
            orderNo: orderDetails.orderNo,
            sellerOrderNo: sellerOrderNo,
            amount: productList.filter(item => item.sellerId === sellerId).reduce((acc, item) => acc + (parseFloat(item.offerPrice) * item.quantity), 0),
            purchasedAmount: productList.filter(item => item.sellerId === sellerId).reduce((acc, item) => acc + (parseFloat(item.purchasedPrice) * item.quantity), 0),
            sellerId: sellerId,
          }
        });

        // check and create shipping
        let newOrderShipping;
        if (isShipping === true) {
          const shippingData = payload.shipping.find(ship => ship.sellerId === sellerId);

          if (shippingData) {
            newOrderShipping = await this.prisma.orderShipping.create({
              data: {
                orderId: orderDetails.id,
                sellerId: sellerId,
                orderShippingType: shippingData.orderShippingType,
                serviceId: shippingData.serviceId || null,
                shippingDate: new Date(shippingData.shippingDate),
                shippingCharge: shippingData.shippingCharge || 0,
                status: "PENDING",
                fromTime: new Date(shippingData?.fromTime) || null,
                toTime: new Date(shippingData?.toTime) || null,
              }
            });
          }
        }

        //order products
        const productListForSeller = productList.filter(item => item.sellerId === sellerId);
        let cartOrder: any = {};
        for (let product of productListForSeller) {

          if (
            product.orderProductType === 'SERVICE' &&
            product.serviceId
          ) {
            const { serviceConfirmType } = await this.prisma.service.findUnique({
              where: { id: product.serviceId },
              select: { serviceConfirmType: true },
            }) || {};

            if (serviceConfirmType === 'AUTO') {
              product.orderProductStatus = 'CONFIRMED';
            }
          }

          let orderProduct = await this.prisma.orderProducts.create({
            data: {
              userId: userId,
              orderNo: orderDetails.orderNo,
              sellerOrderNo: sellerOrderNo, // Use the generated sellerOrderNo
              orderId: orderDetails.id,
              orderSellerId: addOrderSeller.id,
              productPriceId: product.productPriceId,
              productId: product.productId,

              serviceId: product.serviceId,
              serviceFeatures: product.breakdown,

              purchasePrice: product.purchasedPrice,
              salePrice: product.offerPrice,

              sellerId: product.sellerId,
              orderQuantity: product.quantity,
              orderProductDate: new Date(),

              breakdown: product.breakdown,
              customerPay: product.customerPay,
              cashbackToCustomer: product.cashbackToCustomer,
              sellerReceives: product.sellerReceives,
              platformFee: product.platformProfit,

              object: product.object,
              orderShippingId: newOrderShipping?.id || undefined,
              orderProductType: product.orderProductType,
              orderProductStatus: product?.orderProductStatus,
            }
          });

          cartOrder[product.cartId] = orderProduct.id // map cartId to orderId
        }
        

        if (cartProductServiceRelation.length > 0) {
          for (let relation of cartProductServiceRelation) {
            const orderProductId = cartOrder[relation.cartId];
            const relatedOrderProductId = relation.relatedCartId ? cartOrder[relation.relatedCartId] : null;
          
            if (orderProductId) {
              await this.prisma.orderProductService.create({
                data: {
                  productId: relation.productId,
                  serviceId: relation.serviceId,
                  orderProductId: orderProductId,
                  relatedOrderProductId: relatedOrderProductId,
                  orderProductType: relation.cartType // "product" or "service"
                }
              });
            }
          }
        }
      }

      // order Billing address
      await this.prisma.orderAddress.create({
        data: {
          orderId: orderDetails.id,
          firstName: payload?.firstName,
          lastName: payload?.lastName,
          email: payload?.email,
          cc: payload?.cc,
          phone: payload?.phone,
          address: payload?.billingAddress,
          city: payload?.billingCity,
          province: payload?.billingProvince,
          country: payload?.billingCountry,
          postCode: payload?.billingPostCode,
          addressType: 'BILLING',
          countryId: payload?.countryId,
          stateId: payload?.stateId,
          cityId: payload?.cityId,
          town: payload?.town,
        }
      });

      // order shipping address
      await this.prisma.orderAddress.create({
        data: {
          orderId: orderDetails.id,
          firstName: payload?.firstName,
          lastName: payload?.lastName,
          email: payload?.email,
          cc: payload?.cc,
          phone: payload?.phone,
          address: payload?.shippingAddress,
          city: payload?.shippingCity,
          province: payload?.shippingProvince,
          country: payload?.shippingCountry,
          postCode: payload?.shippingPostCode,
          addressType: 'SHIPPING',
          countryId: payload?.countryId,
          stateId: payload?.stateId,
          cityId: payload?.cityId,
          town: payload?.town,
        }
      });

      // Create Transaction Paymob (only for payment gateway, not wallet)
      let newTransaction: any = null;
      if (payload?.paymentMethod !== 'WALLET') {
        newTransaction = await this.prisma.transactionPaymob.create({
          data: {
            userId: userId,
            orderId: orderDetails.id,
            transactionStatus: 'PENDING',
            success: false,
            transactionType: payload?.paymentType || 'DIRECT',
            amount: payload?.paymentType === 'ADVANCE' ? payload?.amount : totalCustomerPay
          }
        });

        let updateOrderDetail = await this.prisma.order.update({
          where: { id: orderDetails.id },
          data: {
            transactionId: newTransaction.id  // Only for payment gateway transactions
          }
        });
      }

      // P0-04 FIX: Atomic cart cleanup — wrap in transaction to prevent partial deletes
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Find all cart IDs for the user
        const cartIds = await tx.cart.findMany({
          where: { userId },
          select: { id: true },
        });
        const cartIdList = cartIds.map(c => c.id);

        // Step 2: Delete from CartServiceFeature (child)
        await tx.cartServiceFeature.deleteMany({
          where: {
            cartId: { in: cartIdList },
          },
        });

        // Step 3: Delete from CartProductService (child)
        await tx.cartProductService.deleteMany({
          where: {
            cartId: { in: cartIdList },
          },
        });

        // Step 4: Delete from Cart (parent)
        await tx.cart.deleteMany({
          where: {
            userId,
          },
        });
      });

      // Fetch updated order details with walletTransactionId
      const updatedOrderDetails = await this.prisma.order.findUnique({
        where: { id: orderDetails.id },
        select: {
          id: true,
          orderNo: true,
          paymentMethod: true,
          transactionId: true,
          walletTransactionId: true as any, // Type assertion for new field
          orderStatus: true,
          totalPrice: true,
          totalCustomerPay: true,
          createdAt: true,
        } as any
      }) as any;

      // Send notifications to vendors/sellers about the new order
      try {
        // Get buyer name for notification
        const buyerName = userDetail?.firstName 
          ? `${userDetail.firstName} ${userDetail.lastName || ''}`.trim()
          : 'A customer';

        for (const sellerId of uniqueSellerIds) {
          // Get seller's order products count for this order
          const sellerOrderProducts = productList.filter(item => item.sellerId === sellerId);
          const productCount = sellerOrderProducts.length;
          const productText = productCount === 1 ? 'product' : 'products';

          // Create notification for seller
          await this.notificationService.createNotification({
            userId: sellerId,
            type: 'ORDER',
            title: 'New Order Received',
            message: `${buyerName} has placed an order (${orderDetails.orderNo}) with ${productCount} ${productText}`,
            data: {
              orderId: orderDetails.id,
              orderNo: orderDetails.orderNo,
              buyerId: userId,
              buyerName: buyerName,
              productCount: productCount,
            },
            link: `/vendor-dashboard`,
            icon: 'order',
          });
        }

        // Also notify the buyer about successful order placement
        await this.notificationService.createNotification({
          userId: userId,
          type: 'ORDER',
          title: 'Order Placed Successfully',
          message: `Your order ${orderDetails.orderNo} has been placed successfully`,
          data: {
            orderId: orderDetails.id,
            orderNo: orderDetails.orderNo,
          },
          link: `/my-orders?orderNo=${orderDetails.orderNo}`,
          icon: 'order',
        });
      } catch (notificationError) {
        // Log error but don't fail the order creation
      }

      return {
        status: true,
        message: 'Created Successfully',
        message1: invalidProducts.length > 0 ? "Some products are not available for your trade role" : "Fetch Successfully",
        data: updatedOrderDetails || orderDetails, // Return updated order with walletTransactionId
        data1: productList,
        totalPrice,
        totalPurchasedPrice,
        discount,
        invalidProducts,
        productCannotBuy: productCannotBuy,
        totalCustomerPay: totalCustomerPay,
        totalPlatformFee: totalPlatformFee,
        totalCashbackToCustomer: totalCashbackToCustomer,
        newTransaction: newTransaction || null // Handle wallet payments (no Paymob transaction)
      };

    } catch (error) {
      return {
        status: false,
        message: 'error in createOrder2',
        error: getErrorMessage(error)
      }
    }
  }

  // Create order from RFQ quote
  async createOrderFromRfqQuote(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const rfqQuotesUserId = payload.rfqQuotesUserId;
      const rfqQuotesId = payload.rfqQuotesId;
      const sellerId = payload.sellerId;
      const rfqQuoteProducts = payload.rfqQuoteProducts || [];
      const rfqSuggestedProducts = payload.rfqSuggestedProducts || []; // NEW: Selected suggested products

      // Fetch RFQ quote details
      const rfqQuoteUser = await this.prisma.rfqQuotesUsers.findUnique({
        where: { id: rfqQuotesUserId },
        include: {
          rfqQuotesUser_rfqQuotes: {
            include: {
              rfqQuotesProducts: {
                include: {
                  rfqProductDetails: true,
                },
              },
            },
          },
        },
      });

      if (!rfqQuoteUser) {
        return {
          status: false,
          message: 'RFQ quote not found',
        };
      }

      // Get user details
      const userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          customerId: true,
          userType: true,
          tradeRole: true,
        },
      });

      // Create order
      const orderNo = `ORD${randomstring.generate({ length: 8, charset: 'numeric' })}`;
      
      // Use totalPrice from payload (already calculated in checkout) or calculate from products
      const totalPrice = payload.totalPrice || rfqQuoteUser.offerPrice || 0;
      const deliveryCharge = payload.deliveryCharge || 0;
      const totalCustomerPay = Number(totalPrice) + Number(deliveryCharge);
      
      const orderData: any = {
        orderNo,
        userId: userId,
        totalPrice: new Decimal(totalPrice),
        totalDiscount: new Decimal(0), // RFQ orders typically don't have discounts
        totalCustomerPay: new Decimal(totalCustomerPay),
        totalPlatformFee: new Decimal(0), // Can be calculated if needed
        deliveryCharge: new Decimal(deliveryCharge),
        orderStatus: 'PENDING',
        orderDate: new Date(),
      };

      const order = await this.prisma.order.create({
        data: orderData,
      });

      // Create order addresses
      if (payload.shippingAddress) {
        await this.prisma.orderAddress.create({
          data: {
            orderId: order.id,
            firstName: payload.firstName || userDetail?.firstName || '',
            lastName: payload.lastName || userDetail?.lastName || '',
            email: payload.email || userDetail?.email || '',
            phone: payload.phone || '',
            address: payload.shippingAddress,
            city: payload.shippingCity || '',
            province: payload.shippingProvince || '',
            country: payload.shippingCountry || '',
            postCode: payload.shippingPostCode || '',
            addressType: 'SHIPPING',
          },
        });
      }

      if (payload.billingAddress || payload.shippingAddress) {
        await this.prisma.orderAddress.create({
          data: {
            orderId: order.id,
            firstName: payload.firstName || userDetail?.firstName || '',
            lastName: payload.lastName || userDetail?.lastName || '',
            email: payload.email || userDetail?.email || '',
            phone: payload.phone || '',
            address: payload.billingAddress || payload.shippingAddress || '',
            city: payload.billingCity || payload.shippingCity || '',
            province: payload.billingProvince || payload.shippingProvince || '',
            country: payload.billingCountry || payload.shippingCountry || '',
            postCode: payload.billingPostCode || payload.shippingPostCode || '',
            addressType: 'BILLING',
          },
        });
      }

      // Convert sellerId to adminId (for subaccounts, this returns the parent account ID)
      // This ensures the order appears in the correct vendor's dashboard
      const sellerAdminId = await this.helperService.getAdminId(sellerId);
      const finalSellerId = sellerAdminId || sellerId;

      // Create order products from RFQ quote products
      const orderProducts = [];
      for (const quoteProduct of rfqQuoteProducts) {
        const rfqProduct = rfqQuoteUser.rfqQuotesUser_rfqQuotes.rfqQuotesProducts.find(
          (p: any) => p.id === quoteProduct.id,
        );

        if (rfqProduct) {
          const orderProduct = await this.prisma.orderProducts.create({
            data: {
              orderId: order.id,
              productId: rfqProduct.rfqProductId,
              userId: userId, // Set userId so the order appears in buyer's order list
              orderQuantity: quoteProduct.quantity || rfqProduct.quantity || 1,
              salePrice: new Decimal(quoteProduct.offerPrice || rfqProduct.offerPrice || 0),
              purchasePrice: new Decimal(quoteProduct.offerPrice || rfqProduct.offerPrice || 0),
              sellerId: finalSellerId, // Use adminId to match query logic
              orderNo: orderNo,
              orderProductDate: new Date(), // Set order date
            },
          });
          orderProducts.push(orderProduct);
        }
      }

      // NEW: Create order products from selected suggested products
      for (const suggestedProduct of rfqSuggestedProducts) {
        try {
          // Verify the suggested product exists and is selected
          // Frontend passes the RfqSuggestedProduct ID as 'id'
          const rfqSuggestedProductRecord = await this.prisma.rfqSuggestedProduct.findUnique({
            where: { id: suggestedProduct.id },
            include: {
              suggestedProduct: {
                select: {
                  id: true,
                  userId: true,
                  status: true,
                },
              },
              vendor: {
                select: {
                  id: true,
                },
              },
            },
          });

          // Verify it's selected by buyer (security check - frontend already filters, but verify on backend)
          if (rfqSuggestedProductRecord && 
              rfqSuggestedProductRecord.isSelectedByBuyer && 
              rfqSuggestedProductRecord.status === 'ACTIVE' &&
              rfqSuggestedProductRecord.rfqQuotesUserId === rfqQuotesUserId) {
            // Use suggestedProductId directly (it's already a Product ID)
            const suggestedProductId = rfqSuggestedProductRecord.suggestedProductId;
            const suggestedProductVendorId = rfqSuggestedProductRecord.vendorId;
            
            // Use the vendor who suggested it as the seller
            const suggestedProductAdminId = await this.helperService.getAdminId(suggestedProductVendorId);
            const finalSuggestedProductSellerId = suggestedProductAdminId || suggestedProductVendorId;

            // Verify the product exists and is active
            const product = await this.prisma.product.findUnique({
              where: { id: suggestedProductId },
              select: { id: true, status: true, userId: true },
            });

            if (product && product.status === 'ACTIVE') {
              const orderProduct = await this.prisma.orderProducts.create({
                data: {
                  orderId: order.id,
                  productId: suggestedProductId,
                  userId: userId, // Buyer ID
                  orderQuantity: suggestedProduct.quantity || rfqSuggestedProductRecord.quantity || 1,
                  salePrice: new Decimal(suggestedProduct.offerPrice || rfqSuggestedProductRecord.offerPrice || 0),
                  purchasePrice: new Decimal(suggestedProduct.offerPrice || rfqSuggestedProductRecord.offerPrice || 0),
                  sellerId: finalSuggestedProductSellerId, // Vendor who suggested the product
                  orderNo: orderNo,
                  orderProductDate: new Date(),
                },
              });
              orderProducts.push(orderProduct);
            }
          }
        } catch (error) {
          // Continue with other products even if one fails
        }
      }

      // Create notifications
      try {
        // Notify buyer
        await this.notificationService.createNotification({
          userId: userId,
          type: 'ORDER',
          title: 'Order Placed',
          message: `Your order ${orderNo} has been placed successfully`,
          data: {
            orderId: order.id,
            orderNo: orderNo,
          },
          link: `/my-orders?orderNo=${orderNo}`,
          icon: 'order',
        });

        // Notify seller
        await this.notificationService.createNotification({
          userId: sellerId,
          type: 'ORDER',
          title: 'New Order Received',
          message: `You have received a new order ${orderNo} from RFQ quote`,
          data: {
            orderId: order.id,
            orderNo: orderNo,
          },
          link: `/vendor-dashboard?orderNo=${orderNo}`,
          icon: 'order',
        });
      } catch (notificationError) {
      }

      return {
        status: true,
        message: 'Order created successfully from RFQ quote',
        data: order,
        orderProducts: orderProducts,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error creating order from RFQ quote',
        error: getErrorMessage(error),
      };
    }
  }
  
  /**
   * @method createOrderUnAuth
   * @description Creates an order for a guest (unauthenticated) user, auto-creating
   *   a user account if one does not already exist for the provided email.
   *
   * Intent:
   *   Support guest checkout by either finding an existing user by email or
   *   creating a new user with a random password, then placing an order using
   *   the resolved userId.
   *
   * Idea:
   *   1. Validate guest email format; normalize to lowercase.
   *   2. Look up existing user by email, or create a new user record with
   *      a randomly generated password (bcrypt-hashed) and a 7-digit uniqueId.
   *   3. Send a welcome email with credentials via NotificationService.
   *   4. Iterate over cartIds, fetching product price details.
   *   5. Build productList and calculate totalPrice (no discount or fee logic).
   *   6. Create Order, group by sellerId, create OrderSeller + OrderProducts.
   *   7. Delete cart items.
   *   8. Save billing and shipping OrderAddress records.
   *
   * Usage:
   *   Called by OrderController.createOrderUnAuth(). No authentication required.
   *
   * Data Flow:
   *   payload.guestUser (email, name, phone) -> user lookup/create
   *   -> payload.cartIds -> productPrice lookup -> order hierarchy writes
   *   -> cart deletion -> address writes -> response
   *
   * Dependencies:
   *   - PrismaClient (user, cart, productPrice, order, orderSeller, orderProducts,
   *     orderAddress)
   *   - bcrypt (genSalt, hash) : Password hashing for new guest users
   *   - randomstring : Password generation + order number generation
   *   - NotificationService.newUserCreatedOnCheckout : Welcome email
   *
   * Notes:
   *   - Unlike createOrder2, this method does NOT perform trade-role validation,
   *     discount application, stock deduction, fee calculation, or EMI handling.
   *   - New guest users are assigned tradeRole='BUYER', status='ACTIVE',
   *     userType='USER'.
   *   - Cart deletion is index-based against payload.cartIds, not user-wide.
   *
   * @param {any} payload - Request body with guestUser object, cartIds, address
   *   fields, and paymentMethod.
   * @returns {Promise<object>} Standard envelope with order details.
   */
  async createOrderUnAuth(payload: any) {
    try {
      // guestUser Creation

      let guestUserId;
      let userId;
      if (payload?.guestUser) {
        if (payload?.guestUser?.email) {
          let re =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
          if (!re.test(String(payload.guestUser.email))) {
            return {
              status: 'false',
              message: 'enter a valid email',
              data: [],
            };
          }
          payload.guestUser.email = payload.guestUser.email.toLowerCase();
        }
  
        const userExist = await this.prisma.user.findUnique({
          where: { email: payload.guestUser.email }
        });
        if (userExist) {
          userId = userExist.id
        } else {

          let firstName = payload?.guestUser?.firstName;
          let lastName = payload?.guestUser?.lastName;
          let email = payload?.guestUser?.email;
          let cc = payload?.guestUser?.cc;
          let phoneNumber = payload?.guestUser?.phoneNumber;

          let rawPassword = randomstring.generate({ length: 8, charset: "alphanumeric" });
          
          const salt = await genSalt(10);
          const password = await hash(rawPassword, salt);

          guestUserId = await this.prisma.user.create({
            data: { 
              firstName, 
              lastName, 
              email,
              password,
              tradeRole: 'BUYER',
              cc,
              phoneNumber,
              status: 'ACTIVE',
              userType: 'USER'
            }
          });
          userId = guestUserId.id;
          let idString = guestUserId.id.toString();
          let requestId;
    
          if (idString.length >= 7) {
            requestId = idString;
          } else {
            requestId = "0".repeat(7 - idString.length) + idString;
          }
          let updatedUser = await this.prisma.user.update({
            where: { id: guestUserId.id },
            data: {
              uniqueId: requestId,
            }
          });

          let data = {
            email: email,
            name: firstName,
            rawPassword: rawPassword
          }
          this.notificationService.newUserCreatedOnCheckout(data);

        }
      }


      let productList: any[] = []
      let deliveryCharge = 0
      let totalPrice = 0;
      let discount = 0;
      for (let i=0; i<payload.cartIds.length; i++) {
        let cartDetails = await this.prisma.cart.findUnique({
          where: { id: payload.cartIds[i] },
          select: { productId: true, quantity: true, productPriceId: true }
        });

        let productPriceDetails = await this.prisma.productPrice.findUnique({
          where: { id: cartDetails.productPriceId },
          select: { id: true, offerPrice: true, adminId: true, productId: true }
        })

      let tempProductDetails = {
        productPriceId: productPriceDetails.id,
        productId: productPriceDetails.productId,
        offerPrice: productPriceDetails.offerPrice,
        quantity: cartDetails.quantity,
        sellerId: productPriceDetails.adminId
      } 
      productList.push(tempProductDetails);

      // calculate cart total
      const totalPriceForProduct = cartDetails.quantity * parseFloat(productPriceDetails.offerPrice.toString());
      totalPrice += totalPriceForProduct;
    }

      // order create
      let orderDetails = await this.prisma.order.create({
        data: {
          userId: userId,
          totalPrice: totalPrice,
          // discount: discount,
          actualPrice: totalPrice,
          paymentMethod: payload?.paymentMethod,
          deliveryCharge: payload?.deliveryCharge || null,
          orderDate: new Date(),
          orderNo: "Ord_" + randomstring.generate({length: 12, charset: "alphanumeric",}),
        }
      });

      const uniqueSellerIds = [...new Set(productList.map(item => item.sellerId))];

      for (let sellerId of uniqueSellerIds) {
        const sellerOrderNo = `Ords_${randomstring.generate({ length: 12, charset: 'alphanumeric' })}`;

        // order seller
        let addOrderSeller = await this.prisma.orderSeller.create({
          data: {
            orderId: orderDetails.id,
            orderNo: orderDetails.orderNo,
            sellerOrderNo: sellerOrderNo,
            amount: productList.filter(item => item.sellerId === sellerId).reduce((acc, item) => acc + (parseFloat(item.offerPrice) * item.quantity), 0),
            sellerId: sellerId
          }
        });

        //order products
        const productListForSeller = productList.filter(item => item.sellerId === sellerId);
        for (let product of productListForSeller) {
          await this.prisma.orderProducts.create({
            data: {
              userId: userId,
              orderNo: orderDetails.orderNo,
              sellerOrderNo: sellerOrderNo, // Use the generated sellerOrderNo
              orderId: orderDetails.id,
              orderSellerId: addOrderSeller.id,
              productPriceId: product.productPriceId,
              productId: product.productId,
              purchasePrice: product.offerPrice,
              salePrice: product.offerPrice,
              sellerId: product.sellerId,
              orderQuantity: product.quantity,
              orderProductDate: new Date()
            }
          });
        }

      }

      // cart delete
      for (let i = 0; i < productList.length; i++) {
        await this.prisma.cart.delete({
          where: { id: payload.cartIds[i] },
        });
      }

      // order Billing address
      await this.prisma.orderAddress.create({
        data: {
          orderId: orderDetails.id,
          firstName: payload?.firstName,
          lastName: payload?.lastName,
          email: payload?.email,
          cc: payload?.cc,
          phone: payload?.phone,
          address: payload?.billingAddress,
          city: payload?.billingCity,
          province: payload?.billingProvince,
          country: payload?.billingCountry,
          postCode: payload?.billingPostCode,
          addressType: 'BILLING'
        }
      });

      // order shipping address
      await this.prisma.orderAddress.create({
        data: {
          orderId: orderDetails.id,
          firstName: payload?.firstName,
          lastName: payload?.lastName,
          email: payload?.email,
          cc: payload?.cc,
          phone: payload?.phone,
          address: payload?.shippingAddress,
          city: payload?.shippingCity,
          province: payload?.shippingProvince,
          country: payload?.shippingCountry,
          postCode: payload?.shippingPostCode,
          addressType: 'SHIPPING'
        }
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: orderDetails
      }

    } catch (error) {
      
      return {
          status: false,
          message: 'error in createOrderUnAuth',
          error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method getAllOrderByUserId
   * @description Retrieves a paginated list of orders for the authenticated buyer.
   *
   * Intent:
   *   Buyer-side order listing showing all orders placed by the current user.
   *
   * Idea:
   *   Queries the order table filtered by userId from the JWT token, includes
   *   related order-products and order-addresses. Uses simple offset-based
   *   pagination (skip/take).
   *
   * Usage:
   *   Called by OrderController.getAllOrderByUserId().
   *
   * Data Flow:
   *   req.user.id -> this.prisma.order.findMany({ where: { userId }, include, skip, take })
   *   -> response envelope
   *
   * Dependencies:
   *   - PrismaClient (order with order_orderProducts, order_orderAddress)
   *
   * Notes:
   *   - Defaults: page=1, limit=10.
   *   - Does not return a totalCount (no this.prisma.order.count call).
   *
   * @param {any} page  - Page number (1-based, parsed to int).
   * @param {any} limit - Items per page (parsed to int).
   * @param {any} req   - Express request; req.user.id is the buyer.
   * @returns {Promise<object>} Standard envelope with order list.
   */
  // ---- **** buyer side start
  async getAllOrderByUserId(page: any, limit: any, req: any) {
    try {
      const userId = req?.user?.id;
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      

      let getAllOrderList = await this.prisma.order.findMany({
        where: { userId: userId },
        include: {
          order_orderProducts: true,
          order_orderAddress: true,
        },
        skip, // Offset
        take: pageSize, // Limit
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllOrderList
      }
      
    } catch (error) {
      return {
          status: false,
          message: 'error in createOrder',
          error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method getOneOrder
   * @description Fetches a single order by ID (unauthenticated access).
   *
   * Intent:
   *   Allow any caller (guest, webhook, external system) to look up a complete
   *   order record by its numeric ID.
   *
   * Idea:
   *   Reads orderId from req.query, performs a findUnique with deeply nested
   *   includes: order-products (with product, productPrice, service, shipping)
   *   and order-addresses.
   *
   * Usage:
   *   Called by OrderController.getOneOrder().
   *
   * Data Flow:
   *   req.query.orderId -> parseInt -> this.prisma.order.findUnique -> response
   *
   * Dependencies:
   *   - PrismaClient (order with nested orderProducts, product, productPrice,
   *     service, orderShippingDetail, orderAddress)
   *
   * Notes:
   *   - Returns { status: false, message: 'Order ID is required' } if orderId
   *     is missing from the query string.
   *   - Returns { status: false, message: 'Order not found' } if no record exists.
   *
   * @param {any} req - Express request with req.query.orderId.
   * @returns {Promise<object>} Standard envelope with the full order or error.
   */
  async getOneOrder(req: any) {
    try {
      const orderId =  req.query.orderId;
      const userId = req.user?.id;

      if (!orderId) {
        return {
          status: false,
          message: 'Order ID is required',
        };
      }

      const order = await this.prisma.order.findUnique({
        where: {
          id: Number(orderId),
        },
        include: {
          order_orderProducts: {
            include: {
              orderProduct_product: true,
              orderProduct_productPrice: true,
              service: true,
              orderShippingDetail: true
            }
          },
          order_orderAddress: true,
        },
      });

      if (!order) {
        return {
          status: false,
          message: 'Order not found',
        };
      }

      // Ownership check: only the order's buyer or one of its sellers may view
      if (userId) {
        const isBuyer = order.userId === userId;
        const isSeller = order.order_orderProducts?.some(
          (op: any) => op.sellerId === userId,
        );
        if (!isBuyer && !isSeller) {
          return {
            status: false,
            message: 'You do not have permission to view this order',
          };
        }
      }

      return {
        status: true,
        message: 'Order fetched successfully',
        data: order,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching order',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllOrderProductByUserId
   * @description Retrieves a paginated, searchable, filterable list of order-products
   *   for the authenticated buyer.
   *
   * Intent:
   *   Buyer-side order-product listing with full-text search on product name and
   *   order number, optional status filter, and optional date-range filter.
   *
   * Idea:
   *   Builds a dynamic Prisma where-condition that:
   *   - Filters by userId (from JWT).
   *   - Applies an OR search across product name and order number (term > 2 chars).
   *   - Optionally filters by orderProductStatus.
   *   - Optionally filters by orderProductDate range (gte/lte).
   *   Includes nested relations: order (with addresses), productPrice (with product
   *   and images), and product (id, adminId). Orders results by createdAt descending.
   *   Also returns a totalCount for frontend pagination.
   *
   * Usage:
   *   Called by OrderController.getAllOrderProductByUserId().
   *
   * Data Flow:
   *   req.user.id + query params -> where condition build
   *   -> this.prisma.orderProducts.findMany + this.prisma.orderProducts.count -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts with order, productPrice, product relations)
   *
   * Notes:
   *   - Search term shorter than 3 characters is treated as empty string.
   *   - Pagination defaults: page=1, limit=10.
   *
   * @param {any} page               - Page number (1-based).
   * @param {any} limit              - Items per page.
   * @param {any} req                - Express request; req.user.id is the buyer.
   * @param {any} term               - Search term for product name or order number.
   * @param {any} orderProductStatus - Optional status filter string.
   * @param {any} startDate          - Optional ISO date string for range start.
   * @param {any} endDate            - Optional ISO date string for range end.
   * @returns {Promise<object>} Standard envelope with data array and totalCount.
   */
  async getAllOrderProductByUserId(page: any, limit: any, req: any, term: any, orderProductStatus: any, startDate: any, endDate: any) {
    try {
      const userId = req?.user?.id;
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let searchTerm = term?.length > 2 ? term : ''

      let productWhereCondition: any = {
        productName: {
          contains: searchTerm,
          mode: 'insensitive'
        },
      };

      let whereCondition: any = {
        userId: userId,
        OR: [
          {
            orderProduct_product: {
              productName: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          },
          {
            orderProduct_order: {
              orderNo: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          }
        ]
      }

      if (orderProductStatus) {
        whereCondition.orderProductStatus = orderProductStatus
      }

      if (startDate && endDate) {
        whereCondition.orderProductDate = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }

      let getAllOrderProduct =  await this.prisma.orderProducts.findMany({
        where: whereCondition,
        include: {
          orderProduct_order: {
            select: {
              id: true,
              orderNo: true,
              orderStatus: true,
              orderDate: true,
              createdAt: true,
              totalPrice: true,
              totalDiscount: true,
              totalCustomerPay: true,
              advanceAmount: true,
              dueAmount: true,
              totalPlatformFee: true,
              paymentType: true,
              order_orderAddress: true
            }
          },   
          orderProduct_productPrice: {
            include: {
              productPrice_product: {
                include: {
                  productImages: true,
                }
              }
            }
          },  
          orderProduct_product: {
            include: {
              productImages: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      });

      if (!getAllOrderProduct) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      let getAllOrderProductCount = await this.prisma.orderProducts.count({
        where: whereCondition
      });
  
      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllOrderProduct,
        totalCount: getAllOrderProductCount
      }

    } catch (error) {
      return {
        status: false,
        message: 'error in getAllOrderProductByUserId',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method getOneOrderProductDetailByUserId
   * @description Fetches the complete detail of a single order-product for the
   *   buyer, including seller info, images, shipping, and sibling order-products.
   *
   * Intent:
   *   Buyer-side detail view for one order-product line item, enriched with
   *   the seller's profile information and all other items in the same order.
   *
   * Idea:
   *   1. Find the order-product by ID with deep includes: order (addresses),
   *      productPrice (admin/seller detail with profile, product with images),
   *      and product (id, adminId).
   *   2. If the order-product has an orderShippingId, fetch the orderShipping record.
   *   3. Fetch the parent order again but include all OTHER order-products
   *      (excluding the queried one) with their price/product details.
   *   4. Return the primary detail, shipping detail, and sibling order-products.
   *
   * Usage:
   *   Called by OrderController.getOneOrderProductDetailByUserId().
   *
   * Data Flow:
   *   orderProductId -> this.prisma.orderProducts.findUnique (deep include)
   *   -> optional this.prisma.orderShipping.findUnique
   *   -> this.prisma.order.findMany (siblings) -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts, orderShipping, order)
   *
   * Notes:
   *   - The sibling query uses `{ id: { not: orderProductID } }` to exclude the
   *     current item from the "other products in this order" list.
   *   - orderShippingDetail is included both inside `data` (spread) and as a
   *     top-level key in the response.
   *
   * @param {any} orderProductId - The ID of the order-product to fetch.
   * @param {any} req            - Express request (currently unused beyond auth).
   * @returns {Promise<object>} Envelope with data (order-product + shipping),
   *   orderShippingDetail, and otherData (sibling order-products).
   */
  async getOneOrderProductDetailByUserId(orderProductId: any, req: any) {
    try {
      const orderProductID = parseInt(orderProductId);

      let getOneOrderProductDetail = await this.prisma.orderProducts.findUnique({
        where: { id: orderProductID },
        include: {
          orderProduct_order: {
            select: {
              id: true,
              orderNo: true,
              orderStatus: true,
              orderDate: true,
              createdAt: true,
              totalPrice: true,
              totalDiscount: true,
              totalCustomerPay: true,
              advanceAmount: true,
              dueAmount: true,
              totalPlatformFee: true,
              paymentType: true,
              order_orderAddress: true
            }
          },
          orderProduct_productPrice: {
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
                      companyName: true
                    }
                  }
                }
              },
              productPrice_product: {
                include: {
                  productImages: true
                }
              }
            }
          }, 
          orderProduct_product: {
            include: {
              productImages: true,
            }
          }
        },
      });

      if (!getOneOrderProductDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      let orderShippingDetail = null;
      if (getOneOrderProductDetail?.orderShippingId) {
        let orderShippingId = getOneOrderProductDetail?.orderShippingId;
        orderShippingDetail = await this.prisma.orderShipping.findUnique({
          where: { id: orderShippingId }
        });
      }
      
      let orderId = getOneOrderProductDetail.orderId;

      let orderDetail = await this.prisma.order.findUnique({
        where: {
          id: orderId
        },
        include: {
          order_orderProducts: {
            where: {
              id: {
                not: orderProductID
              }
            },
            include: {
              orderProduct_productPrice: {
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
                          companyName: true
                        }
                      }
                    }
                  },
                  productPrice_product: {
                    include: {
                      productImages: true
                    }
                  }
                }
              }, 
              orderProduct_product: {
                select: {
                  id: true,
                  adminId: true
                },
                // include: {
                //   userBy: true,
                //   adminBy: true,
                //   productImages: true,
                // }
              }
            }
          }
        }
      })

      return {
        status: true,
        message: 'Fetch Successfully',
        data: {
          ...getOneOrderProductDetail,
          orderShippingDetail,
        },
        orderShippingDetail: orderShippingDetail,
        otherData: orderDetail
      }

    } catch (error) {
      
      return {
        status: false,
        message: 'error in getOneOrderProductDetailByUserId',
        error: getErrorMessage(error)
      }
    }
  }
  // buyer side ends **** ----

  /**
   * @method getAllOrderProductBySellerId
   * @description Retrieves a paginated, searchable list of order-products sold by
   *   the authenticated seller.
   *
   * Intent:
   *   Seller-side order-product listing showing items sold by the current seller
   *   (or their parent admin if the current user is a team MEMBER).
   *
   * Idea:
   *   1. Resolve the seller ID: if the JWT user has tradeRole=MEMBER, use their
   *      addedBy field (parent admin ID) instead.
   *   2. Build a where-condition filtered by sellerId, with an OR search across
   *      product name and sellerOrderNo (term > 2 chars), optional
   *      orderProductStatus filter, and exclusion of orders with PENDING status.
   *   3. Query with nested includes: order (addresses), productPrice (product,
   *      images), product (id, adminId). Order by createdAt desc.
   *   4. Also run a count query for frontend pagination.
   *
   * Usage:
   *   Called by OrderController.getAllOrderProductBySellerId().
   *
   * Data Flow:
   *   req.user.id -> admin resolution via user lookup (tradeRole check)
   *   -> this.prisma.orderProducts.findMany + count -> response
   *
   * Dependencies:
   *   - PrismaClient (user, orderProducts with order, productPrice, product)
   *
   * Notes:
   *   - Only includes orders where orderStatus is NOT 'PENDING' (payment not yet
   *     confirmed orders are excluded from the seller view).
   *   - The resolved sellerId is returned as `selectedAdminId` in the response.
   *   - Pagination defaults: page=1, limit=10.
   *
   * @param {any} page               - Page number (1-based).
   * @param {any} limit              - Items per page.
   * @param {any} req                - Express request; req.user.id is the seller/member.
   * @param {any} term               - Search term for product name or seller order number.
   * @param {any} orderProductStatus - Optional status filter.
   * @returns {Promise<object>} Standard envelope with data array, totalCount,
   *   and selectedAdminId.
   */
  // ---- **** seller side start
  async getAllOrderProductBySellerId(page: any, limit: any, req: any, term: any, orderProductStatus: any) {
    try {
      let sellerId = req?.user?.id;
      // if (req?.query?.selectedAdminId) {
      //   sellerId = parseInt(req.query.selectedAdminId);
      // }
      let adminDetail = await this.prisma.user.findUnique({
        where: { id: sellerId },
        select: {
          id: true,
          tradeRole: true,
          addedBy: true
        }
      });
      if (adminDetail && adminDetail.tradeRole === "MEMBER") {
        sellerId = adminDetail.addedBy;
      }
      
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let searchTerm = term?.length > 2 ? term : ''

      let whereCondition: any = {
        sellerId: sellerId,
        OR: [
          {
            orderProduct_product: {
              productName: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          },
          {
            sellerOrderNo: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        ],
        orderProduct_order: {
          orderStatus: {
            not: 'PENDING'
          }
        }
      }

      if (orderProductStatus) {
        whereCondition.orderProductStatus = orderProductStatus
      }

      let getAllOrderProduct =  await this.prisma.orderProducts.findMany({
        where: whereCondition,
        include: {
          orderProduct_order: {
            include: {
              order_orderAddress: true
            }
          },
          orderProduct_productPrice: {
            include: {
              productPrice_product: {
                include: {
                  productImages: true,
                }
              }
            }
          }, 
          orderProduct_product: {
            select: {
              id: true,
              adminId: true
            },
            // include: {
            //   productImages: true,
            // }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      });

      if (!getAllOrderProduct) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      let getAllOrderProductCount = await this.prisma.orderProducts.count({
        where: whereCondition
      });
  
      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllOrderProduct,
        totalCount: getAllOrderProductCount,
        selectedAdminId: sellerId
      }

    } catch (error) {
      return {
        status: false,
        message: 'error in getAllOrderProductBySellerId',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method getOneOrderProductDetailBySellerId
   * @description Fetches the complete detail of a single order-product from the
   *   seller's perspective, including buyer order addresses and product images.
   *
   * Intent:
   *   Seller-side detail view for one order-product line item.
   *
   * Idea:
   *   1. Find the order-product by ID with deep includes: order (addresses),
   *      productPrice (admin/seller detail with profile, product with images),
   *      product (id, adminId).
   *   2. If the order-product has an orderShippingId, fetch the shipping record.
   *   3. Merge shipping detail into the data response.
   *
   * Usage:
   *   Called by OrderController.getOneOrderProductDetailBySellerId().
   *
   * Data Flow:
   *   orderProductId -> this.prisma.orderProducts.findUnique (deep include)
   *   -> optional this.prisma.orderShipping.findUnique -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts, orderShipping)
   *
   * Notes:
   *   - Unlike the buyer-side counterpart (getOneOrderProductDetailByUserId),
   *     this does NOT return sibling order-products from the same order.
   *   - orderShippingDetail is spread into the data object.
   *
   * @param {any} orderProductId - The ID of the order-product to fetch.
   * @param {any} req            - Express request (currently unused beyond auth).
   * @returns {Promise<object>} Standard envelope with data (order-product + shipping).
   */
  async getOneOrderProductDetailBySellerId(orderProductId: any, req: any) {
    try {
      const orderProductID = parseInt(orderProductId);

      let getOneOrderProductDetail = await this.prisma.orderProducts.findUnique({
        where: { id: orderProductID },
        include: {
          orderProduct_order: {
            include: {
              order_orderAddress: true
            }
          },
          orderProduct_productPrice: {
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
                      companyName: true
                    }
                  }
                }
              },
              productPrice_product: {
                include: {
                  productImages: true,
                }
              }
            }
          }, 
          orderProduct_product: {
            select: {
              id: true,
              adminId: true
            },
            // include: {
            //   productImages: true,
            //   adminBy: { 
            //     select: {
            //       id: true,
            //       firstName: true,
            //       lastName: true,
            //       profilePicture: true,
            //       tradeRole: true,
            //       userProfile: {
            //         select: {
            //           profileType: true,
            //           logo: true,
            //           companyName: true
            //         }
            //       }
            //     }
            //   },
            // }
          }
        },
      });

      if (!getOneOrderProductDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      
      let orderShippingDetail = null;
      if (getOneOrderProductDetail?.orderShippingId) {
        let orderShippingId = getOneOrderProductDetail?.orderShippingId;
        orderShippingDetail = await this.prisma.orderShipping.findUnique({
          where: { id: orderShippingId }
        });
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: {
          ...getOneOrderProductDetail,
          orderShippingDetail
        }
      }

    } catch (error) {
      return {
        status: false,
        message: 'error, in getOneOrderProductDetailBySellerId',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method orderProductStatusById
   * @description Updates the status of a specific order-product record.
   *
   * Intent:
   *   Enable status transitions (e.g. PLACED -> CONFIRMED -> SHIPPED -> DELIVERED)
   *   on individual order-product line items.
   *
   * Idea:
   *   1. Verify the order-product exists by ID.
   *   2. Update its orderProductStatus to the provided value.
   *   3. If the new status is 'SHIPPED' and the order-product has an associated
   *      orderShippingId, also update the orderShipping record status to 'SHIPPED'.
   *
   * Usage:
   *   Called by OrderController.orderProductStatusById(). No auth guard.
   *
   * Data Flow:
   *   payload.orderProductId + payload.status
   *   -> this.prisma.orderProducts.findUnique (existence check)
   *   -> this.prisma.orderProducts.update
   *   -> conditional this.prisma.orderShipping.update -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts, orderShipping)
   *
   * Notes:
   *   - The `status` key in the response envelope (boolean) collides with the
   *     order-product status string, which can be confusing.
   *   - No validation is performed on the status value (any string accepted).
   *   - The orderShipping status sync only occurs for 'SHIPPED' transitions.
   *
   * @param {any} payload - Body containing { orderProductId: number, status: string }.
   * @returns {Promise<object>} Standard envelope with updated order-product.
   */
  async orderProductStatusById(payload: any, req?: any) {
    try {
      const orderProductId = payload?.orderProductId;
      const status = payload?.status;
      const userId = req?.user?.id;

      let existOrderProduct = await this.prisma.orderProducts.findUnique({
        where: { id: orderProductId }
      });

      if (!existOrderProduct) {
        return {
          status: false,
          message: 'Not Found',
          data: existOrderProduct
        }
      }

      // Ownership check: only the buyer or seller of this order-product may update its status
      if (userId) {
        const isBuyer = existOrderProduct.userId === userId;
        const isSeller = existOrderProduct.sellerId === userId;
        if (!isBuyer && !isSeller) {
          return {
            status: false,
            message: 'You do not have permission to update this order product',
          };
        }
      }

      let orderProductDetail = await this.prisma.orderProducts.update({
        where: { id: orderProductId },
        data: { orderProductStatus: status }
      });

      // Get order details for notification
      let orderForNotification = null;
      if (existOrderProduct.orderId) {
        orderForNotification = await this.prisma.order.findUnique({
          where: { id: existOrderProduct.orderId },
          select: {
            id: true,
            orderNo: true,
          }
        });
      }

      // Send notification to buyer about status change
      if (existOrderProduct.userId) {
        try {
          const orderNo = orderForNotification?.orderNo || '';
          const statusMessages: Record<string, { title: string; message: string }> = {
            'CONFIRMED': {
              title: 'Order Confirmed',
              message: `Your order ${orderNo} has been confirmed by the seller`
            },
            'SHIPPED': {
              title: 'Order Shipped',
              message: `Your order ${orderNo} has been shipped`
            },
            'DELIVERED': {
              title: 'Order Delivered',
              message: `Your order ${orderNo} has been delivered`
            },
            'CANCELLED': {
              title: 'Order Cancelled',
              message: `Your order ${orderNo} has been cancelled by the seller`
            }
          };

          const notification = statusMessages[status];
          if (notification) {
            await this.notificationService.createNotification({
              userId: existOrderProduct.userId,
              type: 'ORDER',
              title: notification.title,
              message: notification.message,
              data: {
                orderId: existOrderProduct.orderId,
                orderNo: orderNo,
                orderProductId: orderProductId,
                status: status,
              },
              link: `/my-orders?orderNo=${orderNo}`,
              icon: 'order',
            });
          }
        } catch (notificationError) {
        }
      }

      if (status === 'SHIPPED') {
        const orderShippingId = existOrderProduct?.orderShippingId;
        if (orderShippingId) {
          let updateOrderShipping = await this.prisma.orderShipping.update({
            where: { id: orderShippingId },
            data: {
              status: 'SHIPPED',
            }
          });
        }
      }

      // Process wallet refund if order is cancelled and payment was via wallet
      if (status === 'CANCELLED' && existOrderProduct.orderId) {
        // Fetch order details separately to check payment method
        const order = await this.prisma.order.findUnique({
          where: { id: existOrderProduct.orderId },
          select: {
            id: true,
            paymentMethod: true,
            walletTransactionId: true as any, // Type assertion for new field
            userId: true,
            totalCustomerPay: true,
          } as any
        }) as any;

        // Check if payment was via wallet
        // If walletTransactionId exists, it's definitely a wallet payment (even if paymentMethod isn't set)
        const isWalletPayment = order && order.walletTransactionId && (
          !order.paymentMethod || 
          order.paymentMethod === 'WALLET' || 
          order.paymentMethod?.toUpperCase() === 'WALLET'
        );

        if (isWalletPayment) {
          try {
            // P0-05 FIX: Guard against duplicate refunds — check if refund already processed for this order product
            const existingRefund = await this.prisma.walletTransaction.findFirst({
              where: {
                referenceId: String(order.id),
                referenceType: 'REFUND',
                transactionType: 'REFUND',
              }
            });
            if (existingRefund) {
              // Refund already processed for this order — skip
            } else {
            // Get refund amount - use customerPay if available, otherwise salePrice
            const refundAmount = Number(existOrderProduct.customerPay || existOrderProduct.salePrice || 0);
            // Use orderProduct userId first, fallback to order userId
            const customerId = existOrderProduct.userId || order.userId;
            
            // Get userAccountId from the original wallet payment transaction
            let userAccountId: number | undefined = undefined;
            if (order.walletTransactionId) {
              try {
                const originalPaymentTransaction = await this.prisma.walletTransaction.findUnique({
                  where: { id: order.walletTransactionId },
                  select: {
                    id: true,
                    walletId: true,
                    metadata: true,
                  }
                });
                
                if (originalPaymentTransaction) {
                  // Get the wallet to find userAccountId
                  const wallet = await this.prisma.wallet.findUnique({
                    where: { id: originalPaymentTransaction.walletId },
                    select: {
                      id: true,
                      userId: true,
                      userAccountId: true,
                    }
                  });
                  
                  if (wallet) {
                    userAccountId = wallet.userAccountId || undefined;
                  }
                }
              } catch (error) {
                // Silently handle error - will refund to master wallet
              }
            }
            
            if (refundAmount > 0 && customerId) {
              const refundResult = await this.walletService.processWalletRefund(
                customerId,
                refundAmount,
                order.id,
                userAccountId // Pass the userAccountId to refund to the correct wallet
              );

              if (!refundResult.status) {
              }
            }
            } // end P0-05 else (no existing refund)
          } catch (error) {
            // Log error but don't fail the cancellation
          }
        }
      }

      return {
        status: true,
        message: 'Status Changed Successfully',
        data: orderProductDetail
      }

    } catch (error) {
      return {
        status: false,
        message: 'error, in orderProductStatusById',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method orderShippingStatusUpdateById
   * @description Updates an order-shipping record, currently limited to setting
   *   the receipt field.
   *
   * Intent:
   *   Allow sellers or shipping providers to attach receipt/proof-of-delivery
   *   information to an order-shipping entry.
   *
   * Idea:
   *   Validates that orderShippingId is provided, then updates the orderShipping
   *   record with the receipt data from the payload.
   *
   * Usage:
   *   Called by OrderController.orderShippingStatusUpdateById(). No auth guard.
   *
   * Data Flow:
   *   payload.orderShippingId + payload.receipt
   *   -> this.prisma.orderShipping.update -> response
   *
   * Dependencies:
   *   - PrismaClient (orderShipping)
   *
   * Notes:
   *   - The `status` field update is commented out in the current implementation;
   *     only `receipt` is actually updated.
   *   - The `req` parameter is accepted but not used.
   *
   * @param {any} payload - Body containing { orderShippingId: number, receipt: any }.
   * @param {any} req     - Express request (unused).
   * @returns {Promise<object>} Standard envelope with updated orderShipping record.
   */
  async orderShippingStatusUpdateById(payload: any, req: any) {
    try {
      const orderShippingId = payload?.orderShippingId;
      const userId = req?.user?.id;

      if (!orderShippingId) {
        return {
          status: false,
          message: 'orderShippingId is required.',
          data: []
        }
      }

      // Verify the shipping record exists and the caller is the assigned seller
      const existingShipping = await this.prisma.orderShipping.findUnique({
        where: { id: orderShippingId },
      });

      if (!existingShipping) {
        return { status: false, message: 'Shipping record not found', data: [] };
      }

      if (userId && existingShipping.sellerId !== userId) {
        return { status: false, message: 'You do not have permission to update this shipping record' };
      }

      let updateOrderShipping = await this.prisma.orderShipping.update({
        where: { id: orderShippingId },
        data: {
          // status: payload?.status,
          receipt: payload?.receipt
        }
      });

      return {
        status: true,
        message: 'Updated Successfully',
        data: updateOrderShipping
      }
      
    } catch (error) {
      return {
        status: false,
        message: 'error, in orderStatusUpdateById',
        error: getErrorMessage(error)
      }
    }
  }
  // seller side ends **** ----

  /**
   * @method orderProductCancelReason
   * @description Records a cancellation reason on an order-product.
   *
   * Intent:
   *   Allow buyers to provide a textual reason when requesting cancellation
   *   of an order-product line item.
   *
   * Idea:
   *   Validates that cancelReason is present, then updates the orderProducts
   *   record's cancelReason field.
   *
   * Usage:
   *   Called by OrderController.orderProductCancelReason(). Requires AuthGuard.
   *
   * Data Flow:
   *   payload.orderProductId + payload.cancelReason
   *   -> this.prisma.orderProducts.update({ cancelReason }) -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts)
   *
   * Notes:
   *   - Only updates the cancelReason text field; does NOT change the
   *     orderProductStatus. A separate call to orderProductStatusById is needed.
   *   - Returns { status: false } if cancelReason is missing/falsy.
   *
   * @param {any} payload - Body containing { orderProductId: number, cancelReason: string }.
   * @returns {Promise<object>} Standard envelope with updated order-product.
   */
  async orderProductCancelReason(payload: any) {
    try {
      if(!payload?.cancelReason) {
        return {
          status: false,
          message: 'cancelReason is required',
          data: []
        }
      }
      const orderProductId = payload?.orderProductId;

      let orderProductCancelReason = await this.prisma.orderProducts.update({
        where: { id: orderProductId },
        data: { cancelReason: payload?.cancelReason }
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: orderProductCancelReason
      }
    } catch (error) {
      return {
        status: false,
        message: 'error, in orderProductCancelReason',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @method preOrderCal
   * @description Performs a read-only pre-order price calculation for the checkout
   *   summary, without creating any database records or deducting stock.
   *
   * Intent:
   *   Give the buyer a complete breakdown of what they will pay before confirming
   *   the order: per-item discounts, platform fees, cashback, and totals for both
   *   products and services.
   *
   * Idea:
   *   Mirrors the discount and fee logic of createOrder2 but is strictly read-only:
   *   1. Resolve buyer type (VENDOR/CONSUMER) from user tradeRole.
   *   2. Look up the buyer's address for location-based fee resolution.
   *   3. For each product cart item:
   *      a. Validate trade-role eligibility.
   *      b. Apply vendor or consumer discounts.
   *      c. Call this.calculateFees() to get platform fee breakdown.
   *   4. For each service cart item:
   *      a. Aggregate service feature costs (FLAT/HOURLY).
   *   5. Return the full product list with per-item breakdowns and grand totals.
   *
   * Usage:
   *   Called by OrderController.preOrderCal(). Requires AuthGuard.
   *
   * Data Flow:
   *   req.user.id + payload (cartIds, serviceCartIds, userAddressId)
   *   -> user + address lookup -> per-item discount + fee computation
   *   -> aggregated response (no DB writes)
   *
   * Dependencies:
   *   - PrismaClient (user, userAddress, cart, productPrice, feesLocation,
   *     cartProductService, service, serviceFeature)
   *   - this.calculateFees() : Fee computation helper
   *
   * Notes:
   *   - Products failing trade-role or fee validation are collected in
   *     invalidProducts and productCannotBuy arrays.
   *   - Service items currently have zero platform fees and zero cashback.
   *   - The feesLocation lookup at the start is performed but its result is
   *     not directly used (the actual fee resolution happens inside calculateFees).
   *
   * @param {any} payload - Body with cartIds, serviceCartIds, userAddressId.
   * @param {any} req     - Express request; req.user.id is the buyer.
   * @returns {Promise<object>} Envelope with productList, totals, discounts,
   *   fee summaries, invalidProducts, and productCannotBuy.
   */
  async preOrderCal(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const userAddressId = payload?.userAddressId

      let totalCartIds = [
        ...(payload.cartIds || []),
        ...(payload.serviceCartIds || [])
      ];

      let cartProductServiceRelation = await this.prisma.cartProductService.findMany({
        where: {
          OR: [
            { cartId: { in: totalCartIds } },
            { relatedCartId: { in: totalCartIds } }
          ]
        }
      });

      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          customerId: true,
          userType: true,
          tradeRole: true
        }
      });
      if (!userDetail) {
        return { status: false, message: 'User not found', data: [] };
      }
      let userTradeRole = userDetail.tradeRole;

      const buyerType = ['COMPANY', 'FREELANCER'].includes(userTradeRole) ? 'VENDOR' : 'CONSUMER';

      let userAddress = await this.prisma.userAddress.findUnique({
        where: { id: payload?.userAddressId }
      });
      if (!userAddress) {
        return { status: false, message: 'User address not found', data: [] };
      }
      const countryId = userAddress.countryId;
      const stateId = userAddress.stateId;
      const cityId = userAddress.cityId;

      let FeesLocation;
      if (buyerType === 'VENDOR') {
        FeesLocation = await this.prisma.feesLocation.findMany({
          where: {
            feeLocationType: 'VENDOR',
            countryId: countryId,
            stateId: stateId,
            cityId: cityId
          },
          include: {
            vendorFeesDetails: true,
            // consumerFeesDetails: true
          }
        });
      } else {
        FeesLocation = await this.prisma.feesLocation.findMany({
          where: {
            feeLocationType: 'CONSUMER',
            countryId: countryId,
            stateId: stateId,
            cityId: cityId
          },
          include: {
            // vendorFeesDetails: true,
            consumerFeesDetails: true
          }
        });
      }

      // return {
      //   status: true,
      //   message: "Fetch Successfully",
      //   data: FeesLocation,
      //   countryId: countryId,
      //   stateId: stateId,
      //   cityId: cityId
      // };

      let productList: any[] = [];
      let deliveryCharge = 0;
      let totalPrice = 0;
      let totalPurchasedPrice = 0;
      let discount = 0;
      let invalidProducts: any[] = [];
      let productCannotBuy: any[] = [];
      let totalCustomerPay = 0;
      let totalPlatform = 0
      let totalCashbackToCustomer = 0;

      // Batch-fetch all cart items and their product prices to avoid N+1 queries
      const allCartDetails2 = await this.prisma.cart.findMany({
        where: { id: { in: payload.cartIds } },
        select: { id: true, productId: true, quantity: true, productPriceId: true }
      });
      const cartDetailsMap2 = new Map(allCartDetails2.map(c => [c.id, c]));

      const allProductPriceIds2 = allCartDetails2.map(c => c.productPriceId).filter(Boolean);
      const allProductPriceDetails2 = await this.prisma.productPrice.findMany({
        where: { id: { in: allProductPriceIds2 } },
      });
      const productPriceMap2 = new Map(allProductPriceDetails2.map(p => [p.id, p]));

      for (let i = 0; i < payload.cartIds.length; i++) {
        let cartDetails = cartDetailsMap2.get(payload.cartIds[i]);
        if (!cartDetails) continue;

        let productPriceDetails = productPriceMap2.get(cartDetails.productPriceId);
        if (!productPriceDetails) continue;
        let menuId = productPriceDetails.menuId;
        
        // Note: consumerType is only used for discount calculations, not for purchase restrictions
        // All users can purchase any product regardless of consumerType

        let offerPrice = parseFloat(productPriceDetails.offerPrice.toString());
        let purchasedPrice = offerPrice;
        let discountAmount = 0;
        let discountApplied = false

        //  Apply Discounts
        if (productPriceDetails.consumerType === 'VENDORS' && ['COMPANY', 'FREELANCER'].includes(userTradeRole)) {

          if (productPriceDetails?.vendorDiscountType === 'FLAT') {
            discountAmount = parseFloat(productPriceDetails.vendorDiscount?.toString() || "0");
            purchasedPrice -= discountAmount;
            discountApplied = true;

          } else if (productPriceDetails?.vendorDiscountType === 'PERCENTAGE') {
            discountAmount = (offerPrice * parseFloat(productPriceDetails.vendorDiscount?.toString() || "0")) / 100;
            purchasedPrice -= discountAmount;
            discountApplied = true;
          }

        } else if (productPriceDetails.consumerType === 'CONSUMER' && userTradeRole === 'BUYER') {

          if (productPriceDetails?.consumerDiscountType === 'FLAT') {
            discountAmount = parseFloat(productPriceDetails.consumerDiscount?.toString() || "0");
            purchasedPrice -= discountAmount;
            discountApplied = true;

          } else if (productPriceDetails?.consumerDiscountType === 'PERCENTAGE') {
            discountAmount = (offerPrice * parseFloat(productPriceDetails.consumerDiscount?.toString() || "0")) / 100;
            purchasedPrice -= discountAmount;
            discountApplied = true;
          }

        } else if (productPriceDetails.consumerType === 'EVERYONE') {
          
          if (['COMPANY', 'FREELANCER'].includes(userTradeRole)) {
            if (productPriceDetails?.vendorDiscountType === 'FLAT') {
              discountAmount = parseFloat(productPriceDetails.vendorDiscount?.toString() || "0");
              purchasedPrice -= discountAmount;
              discountApplied = true;

            } else if (productPriceDetails?.vendorDiscountType === 'PERCENTAGE') {
              discountAmount = (offerPrice * parseFloat(productPriceDetails.vendorDiscount?.toString() || "0")) / 100;
              purchasedPrice -= discountAmount;
              discountApplied = true;

            }
          } else if (userTradeRole === 'BUYER') {

            if (productPriceDetails?.consumerDiscountType === 'FLAT') {
              discountAmount = parseFloat(productPriceDetails.consumerDiscount?.toString() || "0");
              purchasedPrice -= discountAmount;
              discountApplied = true;
  
            } else if (productPriceDetails?.consumerDiscountType === 'PERCENTAGE') {
              discountAmount = (offerPrice * parseFloat(productPriceDetails.consumerDiscount?.toString() || "0")) / 100;
              purchasedPrice -= discountAmount;
              discountApplied = true;
  
            }
          }
        } 

        let quantity = cartDetails.quantity;
        let totalProductDiscount = discountAmount * quantity;

        // fee calculation function (define separately)
        const feeResult = await this.calculateFees({
          userAddressId: userAddressId,
          menuId: menuId,
          buyerId: userId,
          buyerType: buyerType,
          productId: productPriceDetails.productId,
          productPriceId: productPriceDetails.id,
          quantity: quantity,
          purchasedPrice: purchasedPrice * quantity
        });

        // return {
        //   status: true,
        //   message: "Fetch Successfully",
        //   data: feeResult.feesFeesType,
        //   breakdown: feeResult.breakdown,
        //   customerPay: feeResult.customerPay,
        //   cashbackToCustomer: feeResult.cashbackToCustomer,
        //   sellerReceives: feeResult.sellerReceives,
        //   platformProfit: feeResult.platformProfit,
        //   productMessage: feeResult.message,
        //   productV: feeResult.productV,
        //   productC: feeResult.productC
        // };

        const breakdown = feeResult.breakdown;
        const customerPay = Number(feeResult.customerPay);
        const cashbackToCustomer = feeResult.cashbackToCustomer;
        const sellerReceives = feeResult.sellerReceives;
        const platformProfit = feeResult.platformProfit;
        const productReasonMessage = feeResult.message;

        if (!feeResult || !feeResult.isValid) {
          productCannotBuy.push({
            productId: cartDetails.productId,
            productReasonMessage: productReasonMessage
          });
          continue;
        }

        productList.push({
          productPriceId: productPriceDetails.id,
          productId: productPriceDetails.productId,
          offerPrice: offerPrice, // actual price per
          purchasedPrice: purchasedPrice, // actual price after discount
          quantity: quantity,
          sellerId: productPriceDetails.adminId,
          discountApplied,
          discountAmount: discountAmount, // discount per quantity
          totalProductDiscount, // total discount on 
          menuId: menuId,
          breakdown: breakdown,
          customerPay: customerPay,
          cashbackToCustomer: cashbackToCustomer,
          sellerReceives: sellerReceives,
          platformProfit: platformProfit
        });

        totalPrice += offerPrice * quantity;
        totalPurchasedPrice += purchasedPrice * quantity;
        discount += totalProductDiscount;

        totalCustomerPay += customerPay;
        totalPlatform += platformProfit;
        totalCashbackToCustomer += cashbackToCustomer;
      }

      // Batch-fetch all service cart items to avoid N+1 queries
      const allServiceCartDetails2 = await this.prisma.cart.findMany({
        where: { id: { in: payload.serviceCartIds } },
        include: {
          service: {
            include: {
              serviceFeatures: true
            }
          },
          cartServiceFeatures: {
            include: {
              serviceFeature: true
            }
          }
        }
      });
      const serviceCartMap2 = new Map(allServiceCartDetails2.map(c => [c.id, c]));

      for (let j = 0; j < payload.serviceCartIds.length; j++) {
        const cartDetails = serviceCartMap2.get(payload.serviceCartIds[j]);
        if (!cartDetails) continue;

        let totalPrice = 0;
        let quantity = 0;
        const breakdownList = [];

        for (let k = 0; k < cartDetails.cartServiceFeatures.length; k++) {

          const feature = cartDetails.cartServiceFeatures[k].serviceFeature;
          const cost = parseFloat(feature.serviceCost.toString());
          const serviceFeatureQuantity = cartDetails.cartServiceFeatures[k].quantity

          if (feature.serviceCostType === 'FLAT') {
            totalPrice += cost;
            quantity += serviceFeatureQuantity

            breakdownList.push({
              id: feature.id,
              name: feature.name,
              cost: cost,
              costType: feature.serviceCostType,
              quantity: serviceFeatureQuantity
            });

          } else if (feature.serviceCostType === 'HOURLY') {
            const hours = cartDetails.service.eachCustomerTime || 1;
            totalPrice += (cost * hours) * serviceFeatureQuantity;
            quantity = serviceFeatureQuantity;

            breakdownList.push({
              id: feature.id,
              name: feature.name,
              cost: cost * hours,
              costType: feature.serviceCostType,
              hours: hours,
              quantity: serviceFeatureQuantity
            });
          }
        }

        productList.push({
          orderProductType: 'SERVICE',
          serviceId: cartDetails.serviceId,
          productPriceId: null,
          productId: null,
          offerPrice: totalPrice / quantity,
          purchasedPrice: totalPrice / quantity,
          quantity: quantity,
          sellerId: cartDetails.service.sellerId,
          discountApplied: false,
          discountAmount: 0,
          totalProductDiscount: 0,
          menuId: null,
          breakdown: { serviceFeatures: breakdownList },
          customerPay: totalPrice,
          cashbackToCustomer: 0,
          sellerReceives: totalPrice,
          platformProfit: 0,
          object: cartDetails.object,
          cartId: cartDetails.id,
        });

        totalCustomerPay += totalPrice;
      }

      return {
        status: true,
        message: invalidProducts.length > 0 ? "Some products are not available for your trade role" : "Fetch Successfully",
        data: productList,
        totalPrice,
        totalPurchasedPrice,
        discount,
        invalidProducts,
        productCannotBuy: productCannotBuy,
        totalCustomerPay: totalCustomerPay,
        totalPlatform: totalPlatform,
        totalCashbackToCustomer: totalCashbackToCustomer
      };

    } catch (error) {
      return {
        status: false,
        message: 'error in preOrderCal',
        error: getErrorMessage(error)
      };
    }
  }
  
  /**
   * @method calculateFees
   * @description Computes platform fees, customer charges, vendor deductions,
   *   cashback, and net payouts for a single product line item.
   *
   * Intent:
   *   Centralized fee calculation engine used by both createOrder2 and preOrderCal.
   *   Determines how much the customer pays above the purchase price, how much
   *   the vendor receives after deductions, and how much the platform earns.
   *
   * Idea:
   *   1. Look up the fee configuration for the product's menuId.
   *   2. Branch on feeType:
   *      a. GLOBAL: Uses a single fee structure (one vendorDetail + one
   *         consumerDetail) for all locations.
   *      b. NONGLOBAL: Matches vendor fees by the product's location
   *         (country/state/city from productPrice) and customer fees by the
   *         buyer's address location.
   *   3. For both branches, compute using Prisma Decimal arithmetic:
   *      - Customer fee = min(purchasedPrice * customerPercentage / 100, maxCap)
   *      - Cashback = raw customer fee - actual charged fee
   *      - Customer pays = purchasedPrice + actual charged fee
   *      - Vendor fee = min(purchasedPrice * vendorPercentage / 100, maxCap)
   *      - VAT = purchasedPrice * vendorVat / 100
   *      - Gateway fee = purchasedPrice * vendorPaymentGateFee / 100
   *      - Vendor receives = purchasedPrice - (vendorFee + VAT + gatewayFee + fixFee)
   *      - Platform profit = customerPay - vendorReceives - cashback
   *   4. Return isValid=true with full breakdown, or isValid=false with a
   *      descriptive message if fees are not configured for the location.
   *
   * Usage:
   *   Called internally by createOrder2() and preOrderCal().
   *   ```
   *   const feeResult = await this.calculateFees({
   *     userAddressId, menuId, buyerId, buyerType,
   *     productId, productPriceId, quantity, purchasedPrice
   *   });
   *   ```
   *
   * Data Flow:
   *   Input params -> this.prisma.fees.findFirst (with deep includes)
   *   -> Decimal arithmetic -> fee breakdown object
   *
   * Dependencies:
   *   - PrismaClient (fees, feesDetail, vendorDetail, consumerDetail, feesLocation,
   *     productPrice, userAddress)
   *   - Decimal from @prisma/client/runtime for precision arithmetic
   *
   * Notes:
   *   - GLOBAL fees use the first feesDetail entry (feesToFeesDetail[0]).
   *   - NONGLOBAL fees require both vendor and customer location matches; if
   *     either is missing, returns isValid=false with an appropriate message.
   *   - If no fee record exists for the menuId at all, returns isValid=false
   *     with message "non applicable".
   *   - All monetary values in the breakdown are rounded to 2 decimal places
   *     via toFixed(2) before being returned as floats.
   *
   * @param {object} params - Destructured parameter object.
   * @param {number} params.userAddressId  - Buyer's address ID (for NONGLOBAL location matching).
   * @param {number} params.menuId         - Product category/menu ID (fee lookup key).
   * @param {number} params.buyerId        - Buyer's user ID.
   * @param {string} params.buyerType      - 'VENDOR' or 'CONSUMER'.
   * @param {number} params.productId      - Product ID.
   * @param {number} params.productPriceId - ProductPrice ID (for NONGLOBAL location lookup).
   * @param {number} params.quantity       - Order quantity (informational, not used in calc).
   * @param {number} params.purchasedPrice - Total price after discounts (quantity * unit price).
   * @returns {Promise<object>} Fee result with isValid, customerPay, cashbackToCustomer,
   *   sellerReceives, platformProfit, breakdown, and diagnostic fields.
   */
  async calculateFees({ userAddressId, menuId, buyerId, buyerType, productId, productPriceId, quantity, purchasedPrice }) {
    
    // checking fees is GLOBAL or NONGLOBAL
    let feesFeesType = await this.prisma.fees.findFirst({
      where: {
        menuId: menuId
      },
    });
    

    if (feesFeesType) {
      if (feesFeesType.feeType === 'GLOBAL') {
        // Later logic here

        let fees = await this.prisma.fees.findFirst({
          where: {
            menuId: menuId
          },
          include: {
            feesToFeesDetail: {
              where: { status: "ACTIVE" },
              include: {
                vendorDetail: {
                  where: { status: "ACTIVE" },
                  include: {
                    vendorLocation: {
                      where: { status: "ACTIVE" },
                      include: {
                        feesLocation_country: true,
                        feesLocation_state: true,
                        feesLocation_city: true,
                      }
                    }
                  }
                },
                consumerDetail: {
                  where: { status: "ACTIVE" },
                  include: {
                    consumerLocation: {
                      where: { status: "ACTIVE" },
                      include: {
                        feesLocation_country: true,
                        feesLocation_state: true,
                        feesLocation_city: true,
                      }
                    }
                  }
                },
              }
            }
          },
        });

        const feeDetail = fees.feesToFeesDetail[0];

        // Vendor side fees
        const vendorPercentage = feeDetail.vendorDetail.vendorPercentage || 0;
        const vendorMaxCapPerDeal = feeDetail.vendorDetail.vendorMaxCapPerDeal || 0;
        const vendorVat = feeDetail.vendorDetail.vendorVat || 0;
        const vendorPaymentGateFee = feeDetail.vendorDetail.vendorPaymentGateFee || 0;
        const vendorFixFee = feeDetail.vendorDetail.vendorFixFee || 0;


        // Customer side fees
        const customerPercentage = feeDetail.consumerDetail.consumerPercentage || 0;
        const customerMaxCapPerDeal = feeDetail.consumerDetail.consumerMaxCapPerDeal || 0;

        // Ensure all inputs are converted to Decimal if not already
        const price = new Decimal(purchasedPrice); // in case purchasedPrice is a number
        

        // Customer Fee Calculation
        const rawCustomerFee = price.mul(customerPercentage).div(100); // price * customerPercentage / 100
        const actualChargedCustomerFee = Decimal.min(rawCustomerFee, customerMaxCapPerDeal); // min (rawCustomerFee - customerMaxCapPerDeal)
        const cashbackToCustomer = rawCustomerFee.sub(actualChargedCustomerFee); // rawCustomerFee - actualChargedCustomerFee
        const totalCustomerPay = price.add(actualChargedCustomerFee); // price + actualChargedCustomerFee

        // Vendor Fee Calculation
        const rawVendorFee = price.mul(vendorPercentage).div(100); // price * vendorPercentage / 100
        const vendorFee = Decimal.min(rawVendorFee, vendorMaxCapPerDeal); // min (rawVendorFee, vendorMaxCapPerDeal)
        const vatAmount = price.mul(vendorVat).div(100); // price * vendorVat / 100
        const gatewayFee = price.mul(vendorPaymentGateFee).div(100); // price  * vendorPaymentGateFee / 100
        const vendorReceives = price.sub(vendorFee.add(vatAmount).add(gatewayFee).add(vendorFixFee)); // price - (vendorFee + vatAmount + gatewayFee + vendorFixFee)

        
        // // Platform profit
        // const platformProfit = totalCustomerPay - vendorReceives - cashbackToCustomer;
        const platformProfit = totalCustomerPay
          .minus(vendorReceives)
          .minus(cashbackToCustomer);

        return {
          isValid: true,
          fees: fees,
          feesFeesType: feesFeesType,
          customerPay: totalCustomerPay,
          cashbackToCustomer: parseFloat(cashbackToCustomer.toFixed(2)),
          sellerReceives: parseFloat(vendorReceives.toFixed(2)),
          platformProfit: parseFloat(platformProfit.toFixed(2)),
          breakdown: {
            customer: {
              purchasedPrice,
              customerPercentage,
              rawCustomerFee: parseFloat(rawCustomerFee.toFixed(2)),
              chargedFee: parseFloat(actualChargedCustomerFee.toFixed(2)),
              cashback: parseFloat(cashbackToCustomer.toFixed(2)),
              totalPay: parseFloat(totalCustomerPay.toFixed(2)),
            },
            vendor: {
              vendorPercentage,
              vendorFee: parseFloat(vendorFee.toFixed(2)),
              vatAmount: parseFloat(vatAmount.toFixed(2)),
              gatewayFee: parseFloat(gatewayFee.toFixed(2)),
              fixFee: parseFloat(vendorFixFee.toFixed(2)),
              payout: parseFloat(vendorReceives.toFixed(2)),
            },
            platform: {
              profit: parseFloat(platformProfit.toFixed(2)),
            }
          }
        };

      } else if (feesFeesType.feeType === 'NONGLOBAL') {

        // vendor fees
        let productPriceDetail = await this.prisma.productPrice.findUnique({
          where: { id: productPriceId }
        })
        const { productCountryId, productStateId, productCityId } = productPriceDetail

        const vendorLocationFees = await this.prisma.fees.findFirst({
          where: {
            menuId: menuId,
            id: feesFeesType.id,
            feesToFeesDetail: {
              some: {
                status: "ACTIVE",
                vendorDetail: {
                  status: "ACTIVE",
                  vendorLocation: {
                    status: "ACTIVE",
                    countryId: productCountryId,
                    stateId: productStateId,
                    cityId: productCityId,
                  }
                }
              }
            }
          },
          include: {
            feesToFeesDetail: {
              where: {
                status: "ACTIVE",
                vendorDetail: {
                  status: "ACTIVE",
                  vendorLocation: {
                    status: "ACTIVE",
                    countryId: productCountryId,
                    stateId: productStateId,
                    cityId: productCityId,
                  }
                }
              },
              include: {
                vendorDetail: {
                  include: {
                    vendorLocation: {
                      include: {
                        feesLocation_country: true,
                        feesLocation_state: true,
                        feesLocation_city: true,
                      }
                    }
                  }
                }
              }
            }
          }
        });
        

        // customer fees
        let userAddress = await this.prisma.userAddress.findUnique({
          where: { id: userAddressId }
        });
        const { countryId, stateId, cityId } = userAddress;
        const customerLocationFees = await this.prisma.fees.findFirst({
          where: {
            menuId: menuId,
            id: feesFeesType.id,
            feesToFeesDetail: {
              some: {
                status: "ACTIVE",
                consumerDetail: {
                  status: "ACTIVE",
                  consumerLocation: {
                    status: "ACTIVE",
                    countryId: countryId,
                    stateId: stateId,
                    cityId: cityId,
                  }
                }
              }
            }
          },
          include: {
            feesToFeesDetail: {
              where: {
                status: "ACTIVE",
                consumerDetail: {
                  status: "ACTIVE",
                  consumerLocation: {
                    status: "ACTIVE",
                    countryId: countryId,
                    stateId: stateId,
                    cityId: cityId,
                  }
                }
              },
              include: {
                consumerDetail: {
                  include: {
                    consumerLocation: {
                      include: {
                        feesLocation_country: true,
                        feesLocation_state: true,
                        feesLocation_city: true,
                      }
                    }
                  }
                }
              }
            }
          }
        });
        

        if (vendorLocationFees && customerLocationFees) {
          const vendorFeeDetail = vendorLocationFees.feesToFeesDetail[0];
          const customerFeeDetail = customerLocationFees.feesToFeesDetail[0];
        
          // Vendor side fees
          const vendorPercentage = vendorFeeDetail.vendorDetail.vendorPercentage || 0;
          const vendorMaxCapPerDeal = vendorFeeDetail.vendorDetail.vendorMaxCapPerDeal || 0;
          const vendorVat = vendorFeeDetail.vendorDetail.vendorVat || 0;
          const vendorPaymentGateFee = vendorFeeDetail.vendorDetail.vendorPaymentGateFee || 0;
          const vendorFixFee = vendorFeeDetail.vendorDetail.vendorFixFee || 0;
        
          // Customer side fees
          const customerPercentage = customerFeeDetail.consumerDetail.consumerPercentage || 0;
          const customerMaxCapPerDeal = customerFeeDetail.consumerDetail.consumerMaxCapPerDeal || 0;
        
          const price = new Decimal(purchasedPrice);
        
          // Customer Fee Calculation
          const rawCustomerFee = price.mul(customerPercentage).div(100);
          const actualChargedCustomerFee = Decimal.min(rawCustomerFee, customerMaxCapPerDeal);
          const cashbackToCustomer = rawCustomerFee.sub(actualChargedCustomerFee);
          const totalCustomerPay = price.add(actualChargedCustomerFee);
        
          // Vendor Fee Calculation
          const rawVendorFee = price.mul(vendorPercentage).div(100);
          const vendorFee = Decimal.min(rawVendorFee, vendorMaxCapPerDeal);
          const vatAmount = price.mul(vendorVat).div(100);
          const gatewayFee = price.mul(vendorPaymentGateFee).div(100);
          const vendorReceives = price.sub(
            vendorFee.add(vatAmount).add(gatewayFee).add(vendorFixFee)
          );
        
          // Platform profit
          const platformProfit = totalCustomerPay
            .sub(vendorReceives)
            .sub(cashbackToCustomer);
        
          return {
            isValid: true,
            message: "Fees calculated successfully",
            feesFeesType,
            customerPay: parseFloat(totalCustomerPay.toFixed(2)),
            cashbackToCustomer: parseFloat(cashbackToCustomer.toFixed(2)),
            sellerReceives: parseFloat(vendorReceives.toFixed(2)),
            platformProfit: parseFloat(platformProfit.toFixed(2)),
            breakdown: {
              customer: {
                purchasedPrice,
                customerPercentage,
                rawCustomerFee: parseFloat(rawCustomerFee.toFixed(2)),
                chargedFee: parseFloat(actualChargedCustomerFee.toFixed(2)),
                cashback: parseFloat(cashbackToCustomer.toFixed(2)),
                totalPay: parseFloat(totalCustomerPay.toFixed(2)),
              },
              vendor: {
                vendorPercentage,
                vendorFee: parseFloat(vendorFee.toFixed(2)),
                vatAmount: parseFloat(vatAmount.toFixed(2)),
                gatewayFee: parseFloat(gatewayFee.toFixed(2)),
                fixFee: parseFloat(vendorFixFee.toFixed(2)),
                payout: parseFloat(vendorReceives.toFixed(2)),
              },
              platform: {
                profit: parseFloat(platformProfit.toFixed(2)),
              }
            },
            productV: vendorLocationFees,
            productC: customerLocationFees,
          };
        }
        
        // Fee not found for one or both
        if (!vendorLocationFees && !customerLocationFees) {
          return {
            isValid: false,
            message: 'Both vendor and customer fees are missing for the provided location',
            feesFeesType,
            customerPay: purchasedPrice,
            sellerReceives: purchasedPrice,
            platformFee: 0,
            breakdown: {},
            productV: vendorLocationFees,
            productC: customerLocationFees
          };
        }

        if (!vendorLocationFees) {
          return {
            isValid: false,
            message: 'Vendor fees not found for the product location',
            feesFeesType,
            customerPay: purchasedPrice,
            sellerReceives: purchasedPrice,
            platformFee: 0,
            breakdown: {},
            productV: vendorLocationFees,
            productC: customerLocationFees
          };
        }

        if (!customerLocationFees) {
          return {
            isValid: false,
            message: 'Customer fees not found for the buyer location',
            feesFeesType,
            customerPay: purchasedPrice,
            sellerReceives: purchasedPrice,
            platformFee: 0,
            breakdown: {},
            productV: vendorLocationFees,
            productC: customerLocationFees
          };
        }

        return {
          isValid: false,
          message: "Fees found successfully (Error)",
          feesFeesType,
          vendorLocationFees,
          customerLocationFees,
          customerPay: purchasedPrice, // placeholder
          sellerReceives: purchasedPrice, // placeholder
          platformFee: 0, // placeholder
          breakdown: {},
          productV: vendorLocationFees,
          productC: customerLocationFees
        };

      }
    } else {
    }

    return {
      feesFeesType: feesFeesType,
      isValid: false,
      message: "non applicable",
      customerPay: purchasedPrice, // example
      sellerReceives: purchasedPrice, // example
      platformFee: 2,
      breakdown: {} // example
    };
  }

  /**
   * @method getSaleDataByMonth
   * @description Returns daily aggregated sales data for a specific seller, month,
   *   and year -- suitable for dashboard chart rendering.
   *
   * Intent:
   *   Provide day-by-day sales totals so the frontend can render a line or bar
   *   chart showing sales volume throughout a calendar month.
   *
   * Idea:
   *   1. Parse the month name (e.g. "january") and year from query params.
   *   2. Compute startDate and endDate for the month using moment.js.
   *   3. Query all non-deleted orderProducts for the given sellerId within the
   *      date range.
   *   4. Aggregate purchasePrice * orderQuantity by calendar day.
   *   5. Build an array of { day, value } entries for each day of the month,
   *      defaulting to 0 for days with no sales.
   *
   * Usage:
   *   Called by OrderController.getSaleDataByMonth(). No auth guard.
   *
   * Data Flow:
   *   req.query.{month, year, sellerId}
   *   -> date range computation (moment)
   *   -> this.prisma.orderProducts.findMany
   *   -> daily aggregation loop -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts)
   *   - moment.js (date range computation and day extraction)
   *
   * Notes:
   *   - Month must be a full English month name (case-insensitive).
   *   - sellerId is passed as a query parameter (not derived from JWT).
   *   - Only non-deleted order-products (deletedAt: null) are included.
   *   - Returns status=false if month or year is missing or month name is invalid.
   *
   * @param {any} req - Express request with query params: month, year, sellerId.
   * @returns {Promise<object>} Envelope with daily sales array { day, value }[],
   *   date range, and metadata.
   */
  async getSaleDataByMonth (req: any) {
    try {
      const { month, year } = req.query;
      // Derive sellerId from the authenticated user instead of trusting query params
      const sellerId = req.user?.id;

      if (!month || !year) {
        return {
          status: false,
          message: 'Month and year are required',
          data: []
        };
      }

      const monthNameToNumber = {
        january: 0, february: 1, march: 2,
        april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8,
        october: 9, november: 10, december: 11
      };

      const monthNum = monthNameToNumber[month.toLowerCase()];

      if (monthNum === undefined) {
        return {
          status: false,
          message: 'Invalid month provided',
          data: []
        };
      }

      const startDate = moment({ year, month: monthNum, day: 1 }).startOf('day').toDate();
      const endDate = moment({ year, month: monthNum }).endOf('month').toDate();

      const orders = await this.prisma.orderProducts.findMany({
        where: {
          sellerId: parseInt(sellerId),
          deletedAt: null,
          orderProductDate: {
            gte: startDate,
            lt: endDate
          }
        },
        select: {
          orderProductDate: true,
          purchasePrice: true,
          orderQuantity: true,
        }
      });

      const dailyTotals = {};

      for (const order of orders) {
        const day = moment(order.orderProductDate).date();
        const price = Number(order.purchasePrice ?? 0) * Number(order.orderQuantity ?? 1);
        dailyTotals[day] = (dailyTotals[day] || 0) + price;
      }

      const totalDays = moment(endDate).subtract(1, 'day').date();

      const result = Array.from({ length: totalDays }, (_, i) => {
        const day = i + 1;
        return {
          day,
          value: dailyTotals[day] || 0
        };
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: {
          result,
          startDate: startDate,
          endDate: endDate,
          month: month,
          year: year,
          sellerId: sellerId
        }
      };

    } catch (error) {
      return {
        status: false,
        message: 'Internal Server Error',
        data: []
      };
    }
  }
  
  /**
   * @method totalSaleCountBySeller
   * @description Returns the total count of order-products sold by the authenticated
   *   seller (resolving team member ownership).
   *
   * Intent:
   *   Dashboard KPI endpoint that shows the seller how many individual
   *   order-product line items they have sold.
   *
   * Idea:
   *   1. Extract the user ID from the JWT token.
   *   2. Resolve to the parent admin ID via HelperService.getAdminId() (handles
   *      team MEMBER -> admin owner mapping).
   *   3. Fetch all orderProducts where sellerId equals the resolved admin ID.
   *   4. Return the count (array length) as totalSaleCount.
   *
   * Usage:
   *   Called by OrderController.totalSaleCountBySeller(). Requires AuthGuard.
   *
   * Data Flow:
   *   req.user.id -> HelperService.getAdminId()
   *   -> this.prisma.orderProducts.findMany({ sellerId })
   *   -> count via .length -> response
   *
   * Dependencies:
   *   - PrismaClient (orderProducts)
   *   - HelperService.getAdminId() : Resolves MEMBER to parent admin ID
   *
   * Notes:
   *   - Uses findMany + .length instead of this.prisma.orderProducts.count() for
   *     counting. This is less efficient for large datasets.
   *   - Returns status=true with an empty data array if no sales found.
   *
   * @param {any} req - Express request; req.user.id is the seller/member.
   * @returns {Promise<object>} Envelope with { totalSaleCount, sellerId }.
   */
  async totalSaleCountBySeller (req: any) {
    try {
      const sellerId = req?.user?.id;
      let admin_id = sellerId;
      admin_id = await this.helperService.getAdminId(admin_id);

      const totalSaleCount = await this.prisma.orderProducts.count({
        where: {
          sellerId: parseInt(admin_id)
        },
      });

      if (totalSaleCount === 0) {
        return {
          status: true,
          message: 'No sales found',
          data: []
        };
      }

      return {
        status: true,
        message: 'Created Successfully',
        data: {
          totalSaleCount: totalSaleCount,
          sellerId: admin_id
        }
      };

    } catch (error) {
      return {
        status: false,
        message: 'Internal Server Error',
        data: []
      };
    }
  }


  /**
   * ORDER SHIPPING - DELIVERY
   */

  /**
   * @method getAllOrderShipping
   * @description Retrieves a paginated list of order-shipping records for the
   *   authenticated shipper/delivery service provider.
   *
   * Intent:
   *   Shipper-side listing of delivery assignments. Shows all orderShipping
   *   entries where the linked service belongs to the current shipper.
   *
   * Idea:
   *   1. Resolve the shipper's admin ID via HelperService.getAdminId().
   *   2. Query orderShipping where serviceDetail.sellerId matches the shipper.
   *   3. Include the full service details (with features) for display.
   *   4. Paginate with skip/take; also return totalCount for frontend pagination.
   *
   * Usage:
   *   Called by OrderController.getAllOrderShipping(). Requires AuthGuard.
   *
   * Data Flow:
   *   req.user.id -> HelperService.getAdminId()
   *   -> this.prisma.orderShipping.findMany + count -> response
   *
   * Dependencies:
   *   - PrismaClient (orderShipping with serviceDetail + serviceFeatures)
   *   - HelperService.getAdminId() : Resolves MEMBER to admin ID
   *
   * Notes:
   *   - Pagination parameters (page, limit, term) are extracted from req.query
   *     inside this method, not from controller-level @Query decorators.
   *   - The search term variable is computed but not used in the where condition.
   *   - Results are ordered by createdAt descending.
   *
   * @param {any} req - Express request; req.user.id is the shipper, req.query
   *   contains page, limit, term.
   * @returns {Promise<object>} Envelope with shipping list and totalCount.
   */
  async getAllOrderShipping (req: any) {
    try {
      let shipperId = req?.user?.id;
      shipperId = await this.helperService.getAdminId(shipperId);

      let Page = parseInt(req?.query?.page) || 1;
      let pageSize = parseInt(req?.query?.limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let searchTerm = req?.query?.term?.length > 2 ? req?.query?.term : ''

      let whereCondition: Prisma.OrderShippingWhereInput = {
        serviceDetail: {
          sellerId: shipperId
        }
      }

      let getAllOrderShipping = await this.prisma.orderShipping.findMany({
        where: whereCondition,
        include: {
          serviceDetail: {
            include: {
              serviceFeatures: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      let getAllOrderShippingCount = await this.prisma.orderShipping.count({
        where: whereCondition
      }); 

      return {
        status: true,
        meesage: "Fetch successfully",
        data: getAllOrderShipping,
        totalCount: getAllOrderShippingCount
      }
      
    } catch (error) {
      return {
        status: false,
        message: 'Internal Server Error',
        data: []
      };
    }
  }

  /**
   * @method getOneOrderShipping
   * @description Fetches a single order-shipping record by ID, including related
   *   order-products, their parent order with addresses, and service info.
   *
   * Intent:
   *   Detail view for a specific shipping/delivery assignment, showing the
   *   shipper everything they need to fulfill the delivery.
   *
   * Idea:
   *   1. Parse orderShippingId from req.query.
   *   2. Validate the ID (return 400 if missing/invalid).
   *   3. Query orderShipping.findUnique with includes: orderProductDetail
   *      (with order and order addresses) and serviceDetail.
   *   4. Return 404 if not found, 200 with data if found.
   *
   * Usage:
   *   Called by OrderController.getOneOrderShipping(). Requires AuthGuard.
   *
   * Data Flow:
   *   req.query.orderShippingId -> parseInt -> this.prisma.orderShipping.findUnique
   *   -> res.status().json()
   *
   * Dependencies:
   *   - PrismaClient (orderShipping with orderProductDetail, order, orderAddress,
   *     serviceDetail)
   *
   * Notes:
   *   - Unlike most other service methods, this method uses the Express Response
   *     object directly to send HTTP status codes (400, 404, 500) instead of
   *     returning a plain envelope object.
   *   - This pattern means NestJS does NOT auto-serialize the return value.
   *
   * @param {any} req - Express request with query.orderShippingId.
   * @param {any} res - Express response for manual status-code JSON responses.
   * @returns {Promise<void>} Sends JSON directly via res.status().json().
   */
  async getOneOrderShipping(req: any, res: any) {
    try {
      const orderShippingId = parseInt(req.query.orderShippingId);
  
      if (!orderShippingId || isNaN(orderShippingId)) {
        return res.status(400).json({
          status: false,
          message: 'Invalid or missing orderShippingId',
          data: [],
        });
      }
  
      const getOneDetail = await this.prisma.orderShipping.findUnique({
        where: { id: orderShippingId },
        include: {
          orderProductDetail: {
            include: { 
              orderProduct_order: {
                include: {
                  order_orderAddress: true
                }
              }
            }
          },
          serviceDetail: true
        }
      });
  
      if (!getOneDetail) {
        return res.status(404).json({
          status: false,
          message: 'Order shipping not found',
          data: [],
        });
      }
  
      return res.status(200).json({
        status: true,
        message: 'Order shipping fetched successfully',
        data: getOneDetail,
      });
  
    } catch (error) {
      return res.status(500).json({
        status: false,
        message: 'Internal Server Error',
        data: [],
      });
    }
  }

  // ==================== VENDOR DASHBOARD METHODS ====================

  async getVendorOrderStats(req: any) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      
      
      if (!adminId) {
        return {
          status: false,
          message: 'Vendor not found or not authorized',
          data: null
        };
      }

      // Debug: Check what orders exist for this adminId
      const debugOrders = await this.prisma.orderProducts.findMany({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          status: 'ACTIVE'
        },
        include: {
          orderProduct_product: {
            select: {
              productName: true
            }
          }
        },
        take: 5
      });

      // Debug: Check all recent orders to see what sellerIds exist
      const allRecentOrders = await this.prisma.orderProducts.findMany({
        where: {
          status: 'ACTIVE',
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        include: {
          orderProduct_product: {
            select: {
              productName: true
            }
          }
        },
        take: 10
      });

      // Get total orders count
      const totalOrders = await this.prisma.orderProducts.count({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          status: 'ACTIVE'
        }
      });

      // Get pending orders count
      const pendingOrders = await this.prisma.orderProducts.count({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          orderProductStatus: 'PLACED',
          status: 'ACTIVE'
        }
      });

      // Get completed orders count
      const completedOrders = await this.prisma.orderProducts.count({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          orderProductStatus: 'DELIVERED',
          status: 'ACTIVE'
        }
      });

      // Get cancelled orders count
      const cancelledOrders = await this.prisma.orderProducts.count({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          orderProductStatus: 'CANCELLED',
          status: 'ACTIVE'
        }
      });

      // Get total revenue
      const revenueResult = await this.prisma.orderProducts.aggregate({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          orderProductStatus: 'DELIVERED',
          status: 'ACTIVE'
        },
        _sum: {
          salePrice: true
        }
      });

      const totalRevenue = revenueResult._sum.salePrice || 0;

      // Get this month's orders
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const thisMonthOrders = await this.prisma.orderProducts.count({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          createdAt: {
            gte: startOfMonth
          },
          status: 'ACTIVE'
        }
      });

      // Get last month's orders
      const startOfLastMonth = new Date();
      startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
      startOfLastMonth.setDate(1);
      startOfLastMonth.setHours(0, 0, 0, 0);

      const endOfLastMonth = new Date();
      endOfLastMonth.setDate(0);
      endOfLastMonth.setHours(23, 59, 59, 999);

      const lastMonthOrders = await this.prisma.orderProducts.count({
        where: {
          sellerId: adminId ? Number(adminId) : undefined,
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth
          },
          status: 'ACTIVE'
        }
      });

      // Calculate average order value
      const averageOrderValue = totalOrders > 0 ? Number(totalRevenue) / totalOrders : 0;

      return {
        status: true,
        message: 'Vendor order statistics retrieved successfully',
        data: {
          totalOrders,
          pendingOrders,
          completedOrders,
          cancelledOrders,
          totalRevenue: Number(totalRevenue),
          thisMonthOrders,
          lastMonthOrders,
          averageOrderValue: Number(averageOrderValue.toFixed(2))
        }
      };

    } catch (error) {
      return {
        status: false,
        message: 'Internal Server Error',
        data: null
      };
    }
  }

  async getVendorRecentOrders(req: any, page: number, limit: number, status?: string, startDate?: string, endDate?: string, search?: string, sellType?: string) {
    try {
      
      // Validate required parameters
      if (!page || !limit) {
        return {
          status: false,
          message: 'Missing required parameters: page and limit',
          data: { orders: [], totalCount: 0 }
        };
      }
      
      // Convert string parameters to integers
      const pageNum = parseInt(page.toString(), 10);
      const limitNum = parseInt(limit.toString(), 10);
      
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      
      if (!adminId) {
        return {
          status: false,
          message: 'Vendor not found or not authorized',
          data: { orders: [], totalCount: 0 }
        };
      }

      const skip = (page - 1) * limit;

      // Build where condition
      let whereCondition: Prisma.OrderProductsWhereInput = {
        sellerId: adminId,
        status: 'ACTIVE'
      };

      // Add status filter if provided
      if (status && status !== 'all') {
        // Map frontend status to database status
        const mapStatusToDb = (frontendStatus: string) => {
          switch (frontendStatus.toLowerCase()) {
            case 'pending':
              return 'PLACED';
            case 'processing':
              return 'CONFIRMED';
            case 'shipped':
              return 'SHIPPED';
            case 'delivered':
              return 'DELIVERED';
            case 'cancelled':
              return 'CANCELLED';
            default:
              return 'PLACED';
          }
        };
        
        const dbStatus = mapStatusToDb(status);
        whereCondition.orderProductStatus = dbStatus as any;
      }

      // Add date range filter if provided
      if (startDate && endDate) {
        whereCondition.createdAt = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }

      // Add search filter if provided
      if (search && search.trim()) {
        whereCondition.OR = [
          {
            orderNo: {
              contains: search,
              mode: 'insensitive'
            }
          },
          {
            orderProduct_product: {
              productName: {
                contains: search,
                mode: 'insensitive'
              }
            }
          }
        ];
      }

      // Get orders with pagination
      
      let orders;
      try {
        // First try a simple query without complex relations
        orders = await this.prisma.orderProducts.findMany({
          where: whereCondition,
          include: {
            orderProduct_product: {
              select: {
                productName: true,
                productImages: {
                  where: { status: 'ACTIVE' },
                  select: {
                    image: true
                  },
                  take: 1
                }
              }
            },
            orderProduct_order: {
              select: {
                order_orderAddress: {
                  where: {
                    addressType: 'SHIPPING'
                  }
                },
                paymentMethod: true,
                transactionId: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: (pageNum - 1) * limitNum,
          take: limitNum
        });
      } catch (prismaError) {
        throw prismaError;
      }

      // If sellType filter is requested, we need to fetch all orders first, filter by sellType, then paginate
      let priceSellTypeMap: Map<number, string> | null = null;
      let filteredOrdersForCount: any[] = [];
      if (sellType) {
        // First, get orders with only the fields needed for sellType filtering (lightweight query)
        const allOrdersForFiltering = await this.prisma.orderProducts.findMany({
          where: whereCondition,
          select: {
            id: true,
            productPriceId: true,
            productId: true,
            userId: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5000, // Safety cap to prevent unbounded queries
        });

        // Get all productPriceIds from all orders
        const allPriceIds = [...new Set(allOrdersForFiltering.map((o: any) => o.productPriceId).filter(Boolean))] as number[];
        
        // Build priceSellTypeMap if there are any productPriceIds
        if (allPriceIds.length) {
          const prices = await this.prisma.productPrice.findMany({
            where: { id: { in: allPriceIds } },
            select: { id: true, sellType: true }
          });
          priceSellTypeMap = new Map(prices.map(p => [p.id, p.sellType]));
        }
        
        const filterType = sellType.toUpperCase();
        
        // Filter all orders by sellType
        // Include RFQ orders (which don't have productPriceId) in NON_BUYGROUP category
        filteredOrdersForCount = allOrdersForFiltering.filter((o: any) => {
          // Check if this is an RFQ order (no productPriceId but has productId)
          const isRfqOrder = !o.productPriceId && o.productId;
          
          if (isRfqOrder) {
            // RFQ orders are treated as NON_BUYGROUP
            return filterType === 'NON_BUYGROUP';
          }
          
          // Regular orders: check sellType from productPrice
          const orderSellType = priceSellTypeMap?.get(o.productPriceId);
          if (filterType === 'BUYGROUP') {
            return orderSellType === 'BUYGROUP';
          } else if (filterType === 'NON_BUYGROUP') {
            return orderSellType !== 'BUYGROUP';
          }
          return false;
        });

        // Now paginate the filtered results
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedFiltered = filteredOrdersForCount.slice(startIndex, endIndex);

        // Re-fetch full data only for the paginated slice
        if (paginatedFiltered.length > 0) {
          const paginatedIds = paginatedFiltered.map((o: any) => o.id);
          orders = await this.prisma.orderProducts.findMany({
            where: { id: { in: paginatedIds } },
            include: {
              orderProduct_product: {
                select: {
                  productName: true,
                  productImages: {
                    where: { status: 'ACTIVE' },
                    select: { image: true },
                    take: 1
                  }
                }
              },
              orderProduct_order: {
                select: {
                  order_orderAddress: {
                    where: { addressType: 'SHIPPING' }
                  },
                  paymentMethod: true,
                  transactionId: true
                }
              }
            },
            orderBy: { createdAt: 'desc' }
          });
        } else {
          orders = [];
        }
      }

      // Get total count
      let totalCount;
      try {
        if (sellType) {
          // Use the count of all filtered orders
          totalCount = filteredOrdersForCount.length;
        } else {
          totalCount = await this.prisma.orderProducts.count({
            where: whereCondition
          });
        }
      } catch (countError) {
        throw countError;
      }

      // Format the response data
      // Get unique user IDs from orders
      const userIds = [...new Set(orders.map(order => order.userId).filter(Boolean))] as number[];
      
      // Fetch user data for all unique user IDs
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: userIds }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          accountName: true,
          masterAccountId: true,
          masterAccount: {
            select: {
              id: true,
              email: true,
              phoneNumber: true
            }
          }
        }
      });
      
      
      // Create a map of user data for quick lookup
      const userMap = new Map(users.map(user => [user.id, user]));
      
      const formattedOrders = orders.map(order => {
        // Map database status to frontend status
        const mapStatus = (dbStatus: string) => {
          switch (dbStatus) {
            case 'PLACED':
              return 'pending';
            case 'CONFIRMED':
              return 'processing';
            case 'SHIPPED':
              return 'shipped';
            case 'OFD':
              return 'shipped'; // Out for Delivery maps to shipped
            case 'DELIVERED':
              return 'delivered';
            case 'RECEIVED':
              return 'delivered'; // Received maps to delivered
            case 'CANCELLED':
              return 'cancelled';
            default:
              return 'pending'; // Default to pending
          }
        };

        // Get customer data from user map
        const user = order.userId ? userMap.get(order.userId) : null;
        
        // Use accountName as primary, fallback to firstName + lastName, then 'Unknown Customer'
        const customerName = user 
          ? (user.accountName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown Customer')
          : 'Unknown Customer';

        // Get email and phone from master account or user account
        const customerEmail = user?.masterAccount?.email || user?.email || '';
        const customerPhone = user?.masterAccount?.phoneNumber || user?.phoneNumber || '';

        // Extract shipping address from the order
        const shippingAddressData = order.orderProduct_order?.order_orderAddress?.find(
          (addr: any) => addr.addressType === 'SHIPPING'
        );

        const derivedPaymentMethod = (order as any)?.orderProduct_order?.paymentMethod
          || (order as any)?.orderProduct_order?.paymentMode
          || (order as any)?.orderProduct_order?.paymentType
          || (order as any)?.orderProduct_order?.paymentGateway
          || (order as any)?.breakdown?.payment?.method
          || (order as any)?.breakdown?.paymentMethod
          || (order as any)?.paymentMethod
          || 'Unknown';

        const derivedTransactionId = (order as any)?.orderProduct_order?.transactionId
          || (order as any)?.breakdown?.payment?.transactionId
          || null;

        const derivedPaymentSource = (order as any)?.breakdown?.payment?.source
          || (order as any)?.breakdown?.payment?.mode
          || (order as any)?.paymentMode
          || null;

        return {
          id: order.id,
          orderNumber: order.orderNo || `ORD-${order.id}`,
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: customerPhone,
          status: mapStatus(order.orderProductStatus),
          totalAmount: Number(order.customerPay || order.salePrice || 0),
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          items: [{
            id: order.productId,
            name: order.orderProduct_product?.productName || 'Unknown Product',
            quantity: order.orderQuantity || 1,
            price: Number(order.customerPay || order.salePrice || 0),
            image: order.orderProduct_product?.productImages?.[0]?.image || null
          }],
          sellType: (priceSellTypeMap && order.productPriceId) ? (priceSellTypeMap.get(order.productPriceId) || null) : null,
          shippingAddress: shippingAddressData || null,
          order_orderAddress: order.orderProduct_order?.order_orderAddress || [], // Include all addresses for frontend compatibility
          tracking: (order as any)?.breakdown?.tracking || null,
          billingAddress: null,
          paymentMethod: derivedPaymentMethod,
          transactionId: derivedTransactionId,
          paymentSource: derivedPaymentSource,
          trackingNumber: null,
          carrier: null,
          notes: order.cancelReason || null
        };
      });

      return {
        status: true,
        message: 'Recent orders retrieved successfully',
        data: {
          orders: formattedOrders,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalItems: totalCount,
            itemsPerPage: limitNum
          }
        }
      };

    } catch (error) {
      return {
        status: false,
        message: 'Internal Server Error',
        data: null
      };
    }
  }

  // ==================== BUYGROUP AUTO CONFIRM ====================
  // Auto-confirm (set to PROCESSING/CONFIRMED) buygroup orders when stock is exhausted while time remains

  private combineDateTime(dateStr?: string | null, timeStr?: string | null): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (timeStr) {
      const [h, m] = String(timeStr).split(":").map((v) => parseInt(v, 10));
      if (!Number.isNaN(h)) d.setHours(h || 0, Number.isNaN(m) ? 0 : m, 0, 0);
    }
    return d;
  }

  private async autoConfirmBuygroupOrdersOnStockOut() {
    try {
      // Find active buygroup product prices
      const prices = await this.prisma.productPrice.findMany({
        where: {
          sellType: 'BUYGROUP',
          status: 'ACTIVE',
        },
        select: {
          id: true,
          stock: true,
          dateClose: true,
          endTime: true,
        },
      });

      const now = new Date();
      for (const pp of prices) {
        const saleEnd = this.combineDateTime(pp.dateClose as any, pp.endTime as any);
        if (saleEnd && now >= saleEnd) continue; // time over, skip (manual flow)

        // Sum ordered quantity across relevant statuses
        const agg = await this.prisma.orderProducts.aggregate({
          where: {
            productPriceId: pp.id,
            status: 'ACTIVE',
            orderProductStatus: { in: ['PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED'] as any },
          },
          _sum: { orderQuantity: true },
        });
        const orderedQty = Number(agg._sum.orderQuantity || 0);
        const stock = Number(pp.stock || 0);

        if (stock > 0 && orderedQty >= stock) {
          // Stock exhausted while time remains -> move PLACED to CONFIRMED (processing)
          await this.prisma.orderProducts.updateMany({
            where: {
              productPriceId: pp.id,
              status: 'ACTIVE',
              orderProductStatus: 'PLACED' as any,
            },
            data: { orderProductStatus: 'CONFIRMED' as any },
          });
        }
      }
    } catch (e) {
      // swallow to avoid crashing interval
    }
  }

  async updateOrderStatus(req: any, payload: any) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const { orderProductId, status, notes } = payload;


      // Verify the order belongs to this vendor
      
      const orderProduct = await this.prisma.orderProducts.findFirst({
        where: {
          id: parseInt(orderProductId),
          sellerId: adminId ? Number(adminId) : undefined,
          status: 'ACTIVE'
        }
      });

      if (!orderProduct) {
        
        return {
          status: false,
          message: 'Order not found or you do not have permission to update this order',
          data: null
        };
      }

      // Map frontend status to database status
      const mapStatusToDb = (frontendStatus: string) => {
        switch (frontendStatus.toLowerCase()) {
          case 'pending':
            return 'PLACED';
          case 'processing':
            return 'CONFIRMED';
          case 'shipped':
            return 'SHIPPED';
          case 'delivered':
            return 'DELIVERED';
          case 'cancelled':
            return 'CANCELLED';
          case 'refunded':
            return 'CANCELLED'; // Use CANCELLED for refunded
          default:
            return 'PLACED'; // Default to PLACED
        }
      };

      const dbStatus = mapStatusToDb(status);

      // Update the order status

      const updatedOrder = await this.prisma.orderProducts.update({
        where: {
          id: parseInt(orderProductId)
        },
        data: {
          orderProductStatus: dbStatus as any,
          ...(notes && { cancelReason: notes })
        }
      });

      // Process wallet refund if order is cancelled and payment was via wallet
      if (dbStatus === 'CANCELLED' && orderProduct.orderId) {
        // Fetch order details separately to check payment method
        const order = await this.prisma.order.findUnique({
          where: { id: orderProduct.orderId },
          select: {
            id: true,
            paymentMethod: true,
            walletTransactionId: true as any, // Type assertion for new field
            userId: true,
          } as any
        }) as any;

        // Check if payment was via wallet
        // If walletTransactionId exists, it's definitely a wallet payment (even if paymentMethod isn't set)
        const isWalletPayment = order && order.walletTransactionId && (
          !order.paymentMethod || 
          order.paymentMethod === 'WALLET' || 
          order.paymentMethod?.toUpperCase() === 'WALLET'
        );

        if (isWalletPayment) {
          try {
            // P0-05 FIX: Guard against duplicate refunds
            const existingRefund = await this.prisma.walletTransaction.findFirst({
              where: {
                referenceId: String(order.id),
                referenceType: 'REFUND',
                transactionType: 'REFUND',
              }
            });
            if (!existingRefund) {
            // Get refund amount - use customerPay if available, otherwise salePrice
            const refundAmount = Number(orderProduct.customerPay || orderProduct.salePrice || 0);
            const customerId = orderProduct.userId || order.userId;

            // Get userAccountId from the original wallet payment transaction
            let userAccountId: number | undefined = undefined;
            if (order.walletTransactionId) {
              try {
                const originalPaymentTransaction = await this.prisma.walletTransaction.findUnique({
                  where: { id: order.walletTransactionId },
                  select: {
                    id: true,
                    walletId: true,
                    metadata: true,
                  }
                });

                if (originalPaymentTransaction) {
                  // Get the wallet to find userAccountId
                  const wallet = await this.prisma.wallet.findUnique({
                    where: { id: originalPaymentTransaction.walletId },
                    select: {
                      id: true,
                      userId: true,
                      userAccountId: true,
                    }
                  });

                  if (wallet) {
                    userAccountId = wallet.userAccountId || undefined;
                  }
                }
              } catch (error) {
                // Silently handle error - will refund to master wallet
              }
            }

            if (refundAmount > 0 && customerId) {
              const refundResult = await this.walletService.processWalletRefund(
                customerId,
                refundAmount,
                order.id,
                userAccountId // Pass the userAccountId to refund to the correct wallet
              );

              if (!refundResult.status) {
              }
            }
            } // end P0-05 duplicate refund guard
          } catch (error) {
            // Log error but don't fail the cancellation
          }
        }
      }

      // Send notification to buyer about status change
      try {
        // Get order details for notification
        const order = await this.prisma.order.findUnique({
          where: { id: orderProduct.orderId },
          select: {
            id: true,
            orderNo: true,
          }
        });

        const statusMessages: Record<string, { title: string; message: string }> = {
          'CONFIRMED': {
            title: 'Order Confirmed',
            message: `Your order ${order?.orderNo || ''} has been confirmed by the seller`
          },
          'SHIPPED': {
            title: 'Order Shipped',
            message: `Your order ${order?.orderNo || ''} has been shipped`
          },
          'DELIVERED': {
            title: 'Order Delivered',
            message: `Your order ${order?.orderNo || ''} has been delivered`
          },
          'CANCELLED': {
            title: 'Order Cancelled',
            message: `Your order ${order?.orderNo || ''} has been cancelled by the seller`
          },
          'PLACED': {
            title: 'Order Status Updated',
            message: `Your order ${order?.orderNo || ''} status has been updated`
          }
        };

        const notification = statusMessages[dbStatus];
        if (notification && orderProduct.userId) {
          await this.notificationService.createNotification({
            userId: orderProduct.userId,
            type: 'ORDER',
            title: notification.title,
            message: notification.message,
            data: {
              orderId: orderProduct.orderId,
              orderNo: order?.orderNo,
              orderProductId: orderProductId,
              status: dbStatus,
            },
            link: `/my-orders?orderNo=${order?.orderNo || ''}`,
            icon: 'order',
          });
        }
      } catch (notificationError) {
      }

      return {
        status: true,
        message: 'Order status updated successfully',
        data: {
          orderId: orderProductId,
          newStatus: status,
          updatedAt: updatedOrder.updatedAt
        }
      };

    } catch (error) {
      return {
        status: false,
        message: `Internal Server Error: ${getErrorMessage(error)}`,
        data: null
      };
    }
  }

  async addOrderTracking(req: any, payload: any) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const { orderProductId, trackingNumber, carrier, notes } = payload;


      // Verify the order belongs to this vendor
      const orderProduct = await this.prisma.orderProducts.findFirst({
        where: {
          id: parseInt(orderProductId),
          sellerId: adminId ? Number(adminId) : undefined,
          status: 'ACTIVE'
        }
      });

      if (!orderProduct) {
        return {
          status: false,
          message: 'Order not found or you do not have permission to update this order',
          data: null
        };
      }

      // For now, we'll store tracking info in the breakdown JSON field
      // In a real implementation, you might want to create a separate tracking table
      const currentBreakdown = orderProduct.breakdown as any || {};
      const updatedBreakdown = {
        ...currentBreakdown,
        tracking: {
          trackingNumber,
          carrier,
          notes,
          addedAt: new Date().toISOString()
        }
      };

      const updatedOrder = await this.prisma.orderProducts.update({
        where: {
          id: parseInt(orderProductId)
        },
        data: {
          breakdown: updatedBreakdown,
          updatedAt: new Date()
        }
      });

      // Send notification to customer (you can implement this)
      // await this.notificationService.sendTrackingUpdateNotification(orderProduct.userId, orderProductId, trackingNumber);

      return {
        status: true,
        message: 'Tracking information added successfully',
        data: {
          orderId: orderProductId,
          trackingNumber,
          carrier,
          addedAt: new Date()
        }
      };

    } catch (error) {
      return {
        status: false,
        message: 'Internal Server Error',
        data: null
      };
    }
  }
  
}
