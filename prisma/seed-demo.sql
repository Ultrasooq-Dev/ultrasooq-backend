-- ═══════════════════════════════════════════════════════════════
-- ULTRASOOQ DEMO SEED — Full flow: RFQ → Quote → Order → Delivery
-- Product: Sony WH-1000XM5 (id=20, priceId=19)
-- Buyer: buyer@ultrasooq.com (id=5)
-- Seller: seller@ultrasooq.com (id=6)
-- ═══════════════════════════════════════════════════════════════

-- Clean previous demo data
DELETE FROM "DeliveryEvent" WHERE "orderProductId" IN (SELECT id FROM "OrderProducts" WHERE "orderNo" LIKE 'DEMO-%');
DELETE FROM "OrderEvent" WHERE "orderProductId" IN (SELECT id FROM "OrderProducts" WHERE "orderNo" LIKE 'DEMO-%');
DELETE FROM "Complaint" WHERE "orderProductId" IN (SELECT id FROM "OrderProducts" WHERE "orderNo" LIKE 'DEMO-%');
DELETE FROM "RefundRequest" WHERE "orderProductId" IN (SELECT id FROM "OrderProducts" WHERE "orderNo" LIKE 'DEMO-%');
DELETE FROM "OrderProducts" WHERE "orderNo" LIKE 'DEMO-%';
DELETE FROM "OrderShipping" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "orderNo" LIKE 'DEMO-%');
DELETE FROM "OrderAddress" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "orderNo" LIKE 'DEMO-%');
DELETE FROM "Order" WHERE "orderNo" LIKE 'DEMO-%';

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: Buyer searches "Sony WH-1000XM5" at /product-hub
-- (ProductView + ProductSearch records)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO "ProductView" ("productId", "userId", "viewCount", "lastViewedAt", "createdAt", "updatedAt")
VALUES (20, 5, 3, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO "ProductSearch" ("userId", "searchTerm", "productId", "clicked", "createdAt", "updatedAt")
VALUES (5, 'sony headphones', 20, true, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days');

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: Buyer adds to RFQ cart & submits RFQ
-- (RfqQuotes → RfqQuotesProducts → assigns to seller)
-- ═══════════════════════════════════════════════════════════════
-- RFQ Address
INSERT INTO "RfqQuoteAddress" ("address", "city", "province", "country", "postCode", "firstName", "lastName", "phoneNumber", "cc", "rfqDate", "createdAt", "updatedAt")
VALUES ('42 Al Khuwair Street', 'Muscat', 'Muscat', 'Oman', '112', 'Test', 'Buyer', '+96812345679', '+968', NOW() + INTERVAL '14 days', NOW(), NOW())
RETURNING id;
-- Assume rfqQuoteAddressId = last inserted

DO $$
DECLARE
  addr_id INT;
  quote_id INT;
  quote_user_id INT;
BEGIN
  -- Get the address we just created
  SELECT id INTO addr_id FROM "RfqQuoteAddress" ORDER BY id DESC LIMIT 1;

  -- Create the RFQ Quote
  INSERT INTO "RfqQuotes" ("buyerID", "rfqQuoteAddressId", "status", "createdAt", "updatedAt")
  VALUES (5, addr_id, 'ACTIVE', NOW() - INTERVAL '6 days', NOW())
  RETURNING id INTO quote_id;

  -- Add product to RFQ: Sony WH-1000XM5, qty 50, budget 100-135 per unit
  INSERT INTO "RfqQuotesProducts" ("rfqQuotesId", "rfqProductId", "quantity", "offerPrice", "offerPriceFrom", "offerPriceTo", "productType", "note", "status", "createdAt", "updatedAt")
  VALUES (quote_id, 20, 50, '135', 100, 135, 'SIMILAR',
    'Need for corporate use. Prefer black or silver color. Bulk packaging OK. Must include carrying case. Quality certification required. Express delivery needed.',
    'ACTIVE', NOW() - INTERVAL '6 days', NOW());

  -- Assign to seller (RfqQuotesUsers)
  INSERT INTO "RfqQuotesUsers" ("rfqQuotesId", "sellerID", "buyerID", "offerPrice", "status", "createdAt", "updatedAt")
  VALUES (quote_id, 6, 5, '0', 'ACTIVE', NOW() - INTERVAL '6 days', NOW())
  RETURNING id INTO quote_user_id;

  -- ═══════════════════════════════════════════════════════════════
  -- STEP 3: Seller sees RFQ at /seller-rfq-list, clicks "Quote & Chat"
  -- STEP 4: Seller sends quote via /messages, buyer accepts
  -- STEP 5: Order is created
  -- ═══════════════════════════════════════════════════════════════

  -- Create the Order
  DECLARE
    order_id INT;
    shipping_id INT;
    op_id INT;
  BEGIN
    INSERT INTO "Order" ("userId", "orderNo", "orderStatus", "totalPrice", "totalCustomerPay", "paymentType", "orderDate", "createdAt", "updatedAt")
    VALUES (5, 'DEMO-ORD-001', 'PAID', 6750, 6750, 'DIRECT', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW())
    RETURNING id INTO order_id;

    -- Shipping
    INSERT INTO "OrderShipping" ("orderId", "orderShippingType", "shippingCharge", "status", "createdAt", "updatedAt")
    VALUES (order_id, 'THIRDPARTY', 0, 'ACTIVE', NOW() - INTERVAL '5 days', NOW())
    RETURNING id INTO shipping_id;

    -- Order Addresses
    INSERT INTO "OrderAddress" ("orderId", "addressType", "firstName", "lastName", "address", "postCode", "phone", "createdAt", "updatedAt")
    VALUES
      (order_id, 'SHIPPING', 'Test', 'Buyer', '42 Al Khuwair Street, Muscat, Oman', '112', '+968 9123 4567', NOW(), NOW()),
      (order_id, 'BILLING', 'Test', 'Buyer', '42 Al Khuwair Street, Muscat, Oman', '112', '+968 9123 4567', NOW(), NOW());

    -- Order Product: 50x Sony WH-1000XM5 at OMR135 each = OMR6750
    INSERT INTO "OrderProducts" ("userId", "orderId", "productId", "productPriceId", "orderQuantity", "purchasePrice", "salePrice", "customerPay", "orderProductStatus", "orderProductDate", "sellerId", "orderNo", "orderShippingId", "createdAt", "updatedAt")
    VALUES (5, order_id, 20, 19, 50, 135, 135, 6750, 'CONFIRMED', NOW() - INTERVAL '5 days', 6, 'DEMO-ORD-001', shipping_id, NOW() - INTERVAL '5 days', NOW())
    RETURNING id INTO op_id;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 6: Seller confirms order (already CONFIRMED above)
    -- DeliveryEvent: Order confirmed
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'CONFIRMED', 'SELLER', 6, 'Order confirmed by seller', '{"stage": "confirmed"}', NOW() - INTERVAL '5 days');

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 7: Seller ships order → status SHIPPED
    -- ═══════════════════════════════════════════════════════════════
    UPDATE "OrderProducts" SET "orderProductStatus" = 'SHIPPED', "updatedAt" = NOW() - INTERVAL '4 days' WHERE id = op_id;

    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'SHIPPED', 'SELLER', 6, 'Order shipped from warehouse', '{"stage": "shipped", "location": "Seller Warehouse, Muscat"}', NOW() - INTERVAL '4 days');

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 8: Seller adds tracking (Aramex)
    -- ═══════════════════════════════════════════════════════════════
    UPDATE "OrderProducts" SET "breakdown" = jsonb_build_object('tracking', jsonb_build_object(
      'trackingNumber', 'AMX-2026-0410-50WH',
      'carrier', 'Aramex',
      'addedAt', (NOW() - INTERVAL '4 days')::text,
      'notes', '📦 Picked up from seller warehouse'
    )), "updatedAt" = NOW() - INTERVAL '4 days' WHERE id = op_id;

    UPDATE "OrderShipping" SET "carrierCode" = 'aramex',
      "carrierTrackingUrl" = 'https://www.aramex.com/us/en/track/shipments?q=AMX-2026-0410-50WH'
    WHERE id = shipping_id;

    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'TRACKING_ADDED', 'SELLER', 6, 'Tracking: Aramex - AMX-2026-0410-50WH', '{"trackingNumber": "AMX-2026-0410-50WH", "carrier": "Aramex", "location": "Muscat Sorting Center"}', NOW() - INTERVAL '4 days');

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 9: Package in transit
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'IN_TRANSIT', 'CARRIER', NULL, '🚚 In transit to destination', '{"stage": "in_transit", "location": "Aramex Hub, Dubai"}', NOW() - INTERVAL '3 days');

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 10: Out for delivery → status OFD
    -- ═══════════════════════════════════════════════════════════════
    UPDATE "OrderProducts" SET "orderProductStatus" = 'OFD', "updatedAt" = NOW() - INTERVAL '2 days' WHERE id = op_id;

    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'OUT_FOR_DELIVERY', 'CARRIER', NULL, '🛵 Out for delivery', '{"stage": "out_for_delivery", "location": "Muscat Local Hub"}', NOW() - INTERVAL '2 days');

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 11: Delivered → status DELIVERED
    -- ═══════════════════════════════════════════════════════════════
    UPDATE "OrderProducts" SET "orderProductStatus" = 'DELIVERED', "updatedAt" = NOW() - INTERVAL '1 day' WHERE id = op_id;

    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'DELIVERED', 'CARRIER', NULL, '✅ Delivered successfully', '{"stage": "delivered", "location": "42 Al Khuwair Street, Muscat"}', NOW() - INTERVAL '1 day');

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 12: Buyer confirms receipt → status RECEIVED
    -- ═══════════════════════════════════════════════════════════════
    UPDATE "OrderProducts" SET "orderProductStatus" = 'RECEIVED', "updatedAt" = NOW() WHERE id = op_id;

    INSERT INTO "DeliveryEvent" ("orderProductId", "event", "actor", "actorUserId", "note", "metadata", "createdAt")
    VALUES (op_id, 'RECEIVED', 'BUYER', 5, 'Buyer confirmed receipt', '{}', NOW());

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 13: Analytics events logged
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO "OrderEvent" ("orderProductId", "orderId", "sellerId", "buyerId", "event", "previousStatus", "revenue", "createdAt")
    VALUES
      (op_id, order_id, 6, 5, 'CONFIRMED', 'PLACED', 6750, NOW() - INTERVAL '5 days'),
      (op_id, order_id, 6, 5, 'SHIPPED', 'CONFIRMED', NULL, NOW() - INTERVAL '4 days'),
      (op_id, order_id, 6, 5, 'OFD', 'SHIPPED', NULL, NOW() - INTERVAL '2 days'),
      (op_id, order_id, 6, 5, 'DELIVERED', 'OFD', NULL, NOW() - INTERVAL '1 day'),
      (op_id, order_id, 6, 5, 'RECEIVED', 'DELIVERED', NULL, NOW());

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 14: Buyer files a complaint (damaged packaging)
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO "Complaint" ("orderProductId", "buyerId", "sellerId", "reason", "description", "status", "createdAt", "updatedAt")
    VALUES (op_id, 5, 6, 'damaged', 'Some units arrived with damaged packaging. 3 out of 50 boxes were crushed during shipping. Products inside seem OK but packaging is not suitable for corporate gifting.', 'OPEN', NOW(), NOW());

    RAISE NOTICE 'Demo seed complete. OrderProduct ID: %, Order ID: %', op_id, order_id;
  END;
END $$;
