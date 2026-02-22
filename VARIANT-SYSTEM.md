# Variant System Documentation

> Complete reference for how product variants work across all 3 repos.
> Last updated: 2026-02-22

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Data Flow Overview](#2-data-flow-overview)
3. [Backend (NestJS)](#3-backend-nestjs)
4. [Frontend - Product Creation Wizard](#4-frontend---product-creation-wizard)
5. [Frontend - Customer Product Page](#5-frontend---customer-product-page)
6. [Frontend - Cart System](#6-frontend---cart-system)
7. [Admin Panel](#7-admin-panel)
8. [Known Bugs & Fixes Applied](#8-known-bugs--fixes-applied)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [File Map](#10-file-map)

---

## 1. Database Schema

### ProductVariant Table

```prisma
model ProductVariant {
  id             Int       @id @default(autoincrement())
  productId      Int?
  productPriceId Int?
  object         Json?        // Stores {type: string, value: string}
  status         Status    @default(ACTIVE)
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([productId])
  @@index([productPriceId])
}
```

**File:** `ultrasooq-backend-main/prisma/schema.prisma` (lines 1013-1025)

### How Variants Are Stored

Each variant option is stored as a **separate row** with a JSON `object` field:

```
id | productId | productPriceId | object
---|-----------|----------------|--------------------------------
 1 |         2 |             21 | {"type":"Color","value":"Red"}
 2 |         2 |             21 | {"type":"Color","value":"Blue"}
 3 |         2 |             21 | {"type":"Color","value":"Black"}
 4 |         2 |             21 | {"type":"Size","value":"S"}
 5 |         2 |             21 | {"type":"Size","value":"M"}
 6 |         2 |             21 | {"type":"Size","value":"L"}
 7 |         2 |             21 | {"type":"Size","value":"XL"}
```

**Key points:**
- Variants are linked to `productPriceId`, NOT directly to `productId`
- Each `{type, value}` pair is ONE row
- No combination/SKU mapping exists — Color and Size are independent, not linked
- No variant-specific pricing at the row level (pricing is separate via `productVariantPricing`)

### Cart Table — Variant Storage

```prisma
model Cart {
  id             Int       @id @default(autoincrement())
  userId         Int?
  deviceId       String?
  productId      Int?
  quantity       Int?
  object         Json?     // Stores selected variants array
  productPriceId Int?
  ...
}
```

The `object` field in Cart stores the user's selected variant combination:
```json
[
  {"type": "Color", "value": "Red"},
  {"type": "Size", "value": "M"}
]
```

---

## 2. Data Flow Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCT CREATION                          │
│                                                             │
│  Frontend Wizard Form                                       │
│  productVariants: [                                         │
│    {type:"Color", variants:[{value:"Red"},{value:"Blue"}]}  │
│    {type:"Size",  variants:[{value:"S"},{value:"M"}]}       │
│  ]                                                          │
│         │                                                   │
│         ▼  (flattened before submit)                        │
│  productVariant: [                                          │
│    {type:"Color",value:"Red"},                              │
│    {type:"Color",value:"Blue"},                             │
│    {type:"Size",value:"S"},                                 │
│    {type:"Size",value:"M"}                                  │
│  ]                                                          │
│         │                                                   │
│         ▼  POST /product/create                             │
│  Backend: creates ProductVariant rows in DB                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   CUSTOMER PRODUCT PAGE                      │
│                                                             │
│  POST /product/getProductVariant {productPriceId: [21]}     │
│         │                                                   │
│         ▼                                                   │
│  API Response: {data: [                                     │
│    {id:1, object:{type:"Color",value:"Red"}},               │
│    {id:2, object:{type:"Color",value:"Blue"}},              │
│    ...                                                      │
│  ]}                                                         │
│         │                                                   │
│         ▼  .map(item => item.object)                        │
│  productVariants = [{type:"Color",value:"Red"}, ...]        │
│  productVariantTypes = ["Color", "Size"]                    │
│         │                                                   │
│         ▼  (passed as props)                                │
│  ProductDescriptionCard renders <select> per type           │
│         │                                                   │
│         ▼  onChange → selectProductVariant callback          │
│  selectedProductVariant = [                                 │
│    {type:"Color",value:"Blue"},                             │
│    {type:"Size",value:"M"}                                  │
│  ]                                                          │
│         │                                                   │
│         ▼  Add to Cart                                      │
│  PATCH /cart/update {productVariant: selectedProductVariant} │
│  → stored in Cart.object                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Backend (NestJS)

### Creating Variants (Product Create)

**File:** `ultrasooq-backend-main/src/product/product.service.ts` (lines 556-566)

```typescript
// BUG (FIXED): Was creating ONE row with entire array as object
// CORRECT: Should loop and create one row per variant
if (payload.productVariant) {
  for (const variant of payload.productVariant) {
    await this.prisma.productVariant.create({
      data: {
        productId: addProduct.id,
        productPriceId: addProductPrice.id,
        object: variant,  // single {type, value} per row
      },
    });
  }
}
```

### Fetching Variants

**File:** `ultrasooq-backend-main/src/product/product.service.ts` (lines 1359-1391)

```typescript
async getProductVariant(payload: any, req: any) {
  const productPriceIds = payload?.productPriceId;  // Array of IDs
  let productVariant = await this.prisma.productVariant.findMany({
    where: {
      productPriceId: { in: productPriceIds },
    },
  });
  return {
    status: true,
    message: 'Fetch Successfully',
    data: productVariant,  // Array of ProductVariant rows
  };
}
```

**Controller:** `ultrasooq-backend-main/src/product/product.controller.ts` (lines 150-171)
- Route: `POST /product/getProductVariant`
- Public endpoint (no auth guard)

### Updating Variants (Product Update)

**File:** `ultrasooq-backend-main/src/product/product.service.ts` (lines 1286-1295)

```typescript
if (payload?.productVariant) {
  await this.prisma.productVariant.updateMany({
    where: { productPriceId: productPriceDetail.id },
    data: { object: payload?.productVariant },
  });
}
```

**NOTE:** This also has the same bug — `updateMany` sets ALL rows to the same `object` value (the entire array). Needs to be fixed to delete old rows and create new individual ones.

---

## 4. Frontend - Product Creation Wizard

### Form Schema (Variants Section)

**File:** `ultrasooq-frontend-main/app/product/page.tsx` (lines 314-320, 496-502)

```typescript
productVariants: z.array(
  z.object({
    type: z.string().optional(),
    variants: z.array(z.object({
      value: z.string().optional(),
      image: z.any().optional(),
    })),
  })
)
```

### Default Form Values

**File:** `ultrasooq-frontend-main/app/product/page.tsx` (lines 643-648)

```typescript
productVariants: [
  { type: "", variants: [{ value: "" }] },
],
```

### Flattening Before Submit

**File:** `ultrasooq-frontend-main/app/product/page.tsx` (lines 1838-1850)

The form stores variants in a grouped format, but flattens them before API call:

```typescript
// Form format (grouped by type):
// productVariants: [
//   {type:"Color", variants:[{value:"Red"},{value:"Blue"}]},
//   {type:"Size",  variants:[{value:"S"},{value:"M"}]}
// ]

// Flattened to payload format:
updatedFormData.productVariant = [];
for (let productVariant of updatedFormData.productVariants) {
  if (productVariant.type) {
    for (let variant of productVariant.variants) {
      if (variant.value) {
        updatedFormData.productVariant.push({
          type: productVariant.type,
          value: variant.value,
        });
      }
    }
  }
}
delete updatedFormData.productVariants;  // remove grouped format
```

### Variant Images

**File:** `ultrasooq-frontend-main/app/product/page.tsx` (lines 1852-1931)

Each variant option can have an associated image. These are:
1. Collected from form fields
2. Uploaded via `handleUploadedFile()`
3. Added to `productImagesList` with a `variant` property: `{type, value}`

### Variant Pricing

**File:** `ultrasooq-frontend-main/app/product/page.tsx` (lines 1936-1949)

```typescript
updatedFormData.productVariantPricing = updatedFormData.variantPricingList
  .filter((vp: any) => vp.combinationKey)
  .map((vp: any) => ({
    combination: vp.combinationKey,
    label: vp.combinationLabel,
    price: Number(vp.price) || 0,
    stock: Number(vp.stock) || 0,
  }));
```

### Wizard Step for Variants

**File:** `ultrasooq-frontend-main/components/modules/createProduct/wizard/Step2ProductDetails.tsx`

The variant form fields are rendered in Step 2 of the wizard with:
- Type input (e.g., "Color", "Size")
- Dynamic list of values per type
- Optional image upload per value
- Add/remove type buttons
- Add/remove value buttons

---

## 5. Frontend - Customer Product Page

### State Declarations

**File:** `ultrasooq-frontend-main/app/trending/[id]/page.tsx` (lines 89-92)

```typescript
const [productVariantTypes, setProductVariantTypes] = useState<string[]>();
const [productVariants, setProductVariants] = useState<any[]>();
const [selectedProductVariant, setSelectedProductVariant] = useState<any>(null);
```

- `productVariantTypes`: unique type names, e.g. `["Color", "Size"]`
- `productVariants`: flat array of all variant objects
- `selectedProductVariant`: array of currently selected variants (one per type)

### Fetching Variants

**File:** `ultrasooq-frontend-main/app/trending/[id]/page.tsx` (lines 338-353)

```typescript
useEffect(() => {
  const fetchProductVariant = async () => {
    const response = await getProductVariant.mutateAsync([
      productDetails?.product_productPrice?.[0]?.id,
    ]);
    const variants = response?.data?.map((item: any) => item.object) || [];
    if (variants.length > 0) {
      let variantTypes = variants.map((item: any) => item.type);
      variantTypes = Array.from(new Set(variantTypes));
      setProductVariantTypes(variantTypes);
      setProductVariants(variants);
    }
  };
  if (!productQueryById?.isLoading) fetchProductVariant();
}, [productQueryById?.data?.data]);
```

### Initial Variant Selection

**File:** `ultrasooq-frontend-main/app/trending/[id]/page.tsx` (lines 380-402)

```typescript
useEffect(() => {
  if (getProductVariantByDevice || getProductVariantByUser) {
    // Restore from cart
    setSelectedProductVariant(
      getProductVariantByDevice || getProductVariantByUser,
    );
  } else {
    // Default: first value of each type
    setSelectedProductVariant(
      productVariantTypes?.map((variantType: string) => {
        return productVariants?.find((v: any) => v.type == variantType);
      }),
    );
  }
}, [cartListByUser.data?.data, cartListByDeviceQuery.data?.data, productVariants?.length]);
```

### Select Variant Callback

**File:** `ultrasooq-frontend-main/app/trending/[id]/page.tsx` (lines 249-254)

```typescript
const selectProductVariant = (variant: any) => {
  setSelectedProductVariant(variant);
  // If item already in cart, update cart with new variant
  if (getProductQuantityByDevice > 0 || getProductQuantityByUser > 0) {
    handleAddToCart(globalQuantity, "add", variant);
  }
};
```

### Props Passed to ProductDescriptionCard

**File:** `ultrasooq-frontend-main/app/trending/[id]/page.tsx` (lines 799-802)

```typescript
productVariantTypes={productVariantTypes}     // ["Color", "Size"]
productVariants={productVariants}             // [{type,value}, ...]
selectedProductVariant={selectedProductVariant} // [{type:"Color",value:"Red"}, ...]
selectProductVariant={selectProductVariant}     // callback
```

### ProductDescriptionCard — Dropdown Rendering

**File:** `ultrasooq-frontend-main/components/modules/productDetails/ProductDescriptionCard.tsx`

**Local state** (line 186-188):
```typescript
const [selectedProductVariants, setSelectedProductVariants] = useState<any>(
  selectedProductVariant,  // initialized from prop
);
```

**Initialization useEffect** (lines 331-349):
```typescript
useEffect(() => {
  if (productVariantTypes.length > 0 && productVariants.length > 0) {
    if (!selectedProductVariant) {
      // Build defaults: first value of each type
      let selectedVariants = [];
      productVariantTypes.forEach((variantType) => {
        selectedVariants.push(
          productVariants.find((v) => v.type == variantType),
        );
      });
      setSelectedProductVariants(selectedVariants);
    } else {
      setSelectedProductVariants(
        !Array.isArray(selectedProductVariant)
          ? [selectedProductVariant]
          : selectedProductVariant,
      );
    }
  }
}, [productVariants.length, selectedProductVariant]);
```

**Dropdown rendering** (lines 635-695):
```typescript
{productVariantTypes?.map((type, index) => {
  // Display value reads from PROP
  let selectedVariant = !Array.isArray(selectedProductVariant)
    ? [selectedProductVariant] : selectedProductVariant;

  return (
    <select
      value={selectedVariant?.find(v => v?.type == type)?.value}
      onChange={(e) => {
        // onChange reads/writes LOCAL STATE
        const selected = productVariants.find(
          v => v.type == type && v.value == value
        );
        // Replace matching type in local state array
        if (selectedProductVariants.find(v => v.type == selected.type)) {
          selectedVariants = selectedProductVariants.map(v =>
            v.type == selected.type ? selected : v
          );
        } else {
          selectedVariants = [...selectedProductVariants, selected];
        }
        setSelectedProductVariants(selectedVariants);  // update local
        selectProductVariant?.(selectedVariants);       // notify parent
      }}
    >
      {productVariants?.filter(v => v.type == type)
        ?.map(v => <option value={v.value}>{v.value}</option>)}
    </select>
  );
})}
```

---

## 6. Frontend - Cart System

### Cart API Requests

**File:** `ultrasooq-frontend-main/apis/requests/cart.requests.ts`

```typescript
// Authenticated user
export const updateCartWithLogin = (payload: {
  productPriceId: number;
  quantity: number;
  sharedLinkId?: number;
  productVariant?: Record<string, unknown>;
}) => axios.patch(`${getApiUrl()}/cart/update`, payload, { headers... });

// Unauthenticated (device-based)
export const updateCartByDevice = (payload: {
  productPriceId: number;
  quantity: number;
  deviceId: string;
  sharedLinkId?: number;
  productVariant?: Record<string, unknown>;
}) => axios.patch(`${getApiUrl()}/cart/updateUnAuth`, payload);
```

### Cart Mutations (React Query)

**File:** `ultrasooq-frontend-main/apis/queries/cart.queries.ts`

Both mutations invalidate their respective query keys on success:
- `useUpdateCartWithLogin` → invalidates `["cart-by-user"]`, `["cart-count-with-login"]`
- `useUpdateCartByDevice` → invalidates `["cart-by-device"]`, `["cart-count-without-login"]`

### Cart Variant Restoration

**File:** `ultrasooq-frontend-main/app/trending/[id]/page.tsx` (lines 163-177)

```typescript
const getProductVariantByUser = cartListByUser.data?.data?.find(
  (item) => item.productId === Number(searchParams?.id),
)?.object;  // reads Cart.object field

const getProductVariantByDevice = cartListByDeviceQuery.data?.data?.find(
  (item) => item.productId === Number(searchParams?.id),
)?.object;
```

### Backend Cart Storage

**File:** `ultrasooq-backend-main/src/cart/cart.service.ts` (lines 85-175)

```typescript
// payload.productVariant → Cart.object (direct 1:1 mapping)
await this.prisma.cart.update({
  where: { id: existingCart.id },
  data: {
    quantity: payload?.quantity,
    object: payload?.productVariant,  // stored as-is
  },
});
```

### Cart Display (ProductCard)

**File:** `ultrasooq-frontend-main/components/modules/cartList/Cart.tsx`
- Passes `item.object` as `productVariant` prop to `ProductCard`

**File:** `ultrasooq-frontend-main/components/modules/cartList/ProductCard.tsx`
- Receives `productVariant` prop
- Stores in local state
- Sends back in cart update calls

---

## 7. Admin Panel

**Status:** The admin panel has NO variant management UI.

**File:** `ultrasooq-admin-main/src/views/user/Scrap/BulkAddProducts.tsx` (line 307)
```typescript
productVariants: [],  // hardcoded empty
```

The admin product form (`ProductForm.tsx`, `ExistingProductForm.tsx`) does not include variant fields. Variants can only be created through the frontend product wizard.

---

## 8. Known Bugs & Fixes Applied

### BUG 1: Backend creates ONE row instead of individual rows (CRITICAL)
- **Location:** `product.service.ts` line 557
- **Problem:** `prisma.productVariant.create({ object: payload.productVariant })` stores entire array as one JSON blob
- **Expected:** One row per `{type, value}` pair
- **Impact:** Products created via frontend wizard have broken variant display
- **Fix:** Loop over array and create individual rows

### BUG 2: Two sources of truth in ProductDescriptionCard (HIGH)
- **Location:** `ProductDescriptionCard.tsx` lines 186, 637, 660
- **Problem:** `select` value reads from prop (`selectedProductVariant`), `onChange` reads/writes local state (`selectedProductVariants`). These diverge.
- **Fix:** Remove local state, use only prop + callback

### BUG 3: Cart refetch overrides user selection (MEDIUM)
- **Location:** `page.tsx` lines 380-402
- **Problem:** After add-to-cart, cart refetch triggers useEffect that resets `selectedProductVariant`
- **Fix:** Separate initial load from refetch, or use a flag to prevent override during active selection

### BUG 4: Initial null state race condition (MEDIUM)
- **Location:** `ProductDescriptionCard.tsx` line 186
- **Problem:** `selectedProductVariants` starts as `null` (prop is null on first render), causing crash in `onChange` if user clicks dropdown before initialization
- **Fix:** Resolved by Bug 2 fix (removing local state)

### BUG 5: Backend updateMany sets all rows to same value (MEDIUM)
- **Location:** `product.service.ts` lines 1286-1295
- **Problem:** `updateMany` sets ALL variant rows' `object` to the same array
- **Fix:** Delete old rows, create new individual rows

### FIXED: Variant response parsing (commit 949c09b)
- **Was:** `response?.data?.[0]?.object` (only first item)
- **Now:** `response?.data?.map((item: any) => item.object)` (all items)

### FIXED: placehold.co image host (commit 949c09b)
- Added `placehold.co` to `next.config.js` remotePatterns

---

## 9. API Endpoints Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/product/create` | POST | Yes | Create product with variants |
| `/product/getProductVariant` | POST | No | Fetch variants by productPriceId |
| `/admin/updateProduct` | PATCH | Yes | Update product (admin) |
| `/cart/update` | PATCH | Yes | Add/update cart (logged in) |
| `/cart/updateUnAuth` | PATCH | No | Add/update cart (device-based) |

### Request/Response Formats

**getProductVariant Request:**
```json
{ "productPriceId": [21] }
```

**getProductVariant Response:**
```json
{
  "status": true,
  "message": "Fetch Successfully",
  "data": [
    {"id": 1, "productId": 2, "productPriceId": 21, "object": {"type": "Color", "value": "Red"}},
    {"id": 2, "productId": 2, "productPriceId": 21, "object": {"type": "Color", "value": "Blue"}}
  ]
}
```

**Cart Update Request:**
```json
{
  "productPriceId": 21,
  "quantity": 1,
  "productVariant": [
    {"type": "Color", "value": "Red"},
    {"type": "Size", "value": "M"}
  ]
}
```

---

## 10. File Map

### Backend
| File | What it does |
|------|-------------|
| `src/product/product.service.ts:556-566` | Creates variant rows during product creation |
| `src/product/product.service.ts:1286-1295` | Updates variant rows during product update |
| `src/product/product.service.ts:1359-1391` | `getProductVariant()` — fetches variants by productPriceId |
| `src/product/product.controller.ts:150-171` | Route: POST `/product/getProductVariant` |
| `src/cart/cart.service.ts:85-175` | Cart update — stores `productVariant` as `Cart.object` |
| `prisma/schema.prisma:1013-1025` | ProductVariant model definition |

### Frontend
| File | What it does |
|------|-------------|
| `app/trending/[id]/page.tsx:89-92` | Variant state declarations |
| `app/trending/[id]/page.tsx:338-353` | Fetch + parse variant data from API |
| `app/trending/[id]/page.tsx:380-402` | Initial variant selection (from cart or defaults) |
| `app/trending/[id]/page.tsx:249-254` | `selectProductVariant` callback |
| `app/trending/[id]/page.tsx:433-533` | `handleAddToCart` — sends variant with cart update |
| `app/trending/[id]/page.tsx:799-802` | Props passed to ProductDescriptionCard |
| `app/trending/[id]/page.tsx:1838-1850` | Flatten variants before product create API call |
| `components/modules/productDetails/ProductDescriptionCard.tsx:186-188` | Local variant state (source of bugs) |
| `components/modules/productDetails/ProductDescriptionCard.tsx:331-349` | Variant initialization useEffect |
| `components/modules/productDetails/ProductDescriptionCard.tsx:635-695` | Variant dropdown rendering + onChange |
| `apis/requests/product.request.ts:545-558` | `fetchProductVariant` API call |
| `apis/queries/product.queries.ts:698-709` | `useProductVariant` mutation hook |
| `apis/requests/cart.requests.ts` | Cart API calls with productVariant field |
| `apis/queries/cart.queries.ts` | Cart mutation hooks |

### Admin
| File | What it does |
|------|-------------|
| `src/views/user/Scrap/BulkAddProducts.tsx:307` | `productVariants: []` (hardcoded empty, no UI) |
