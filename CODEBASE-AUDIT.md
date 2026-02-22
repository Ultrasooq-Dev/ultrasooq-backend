# Ultrasooq Codebase Audit Report

> Full study: quantity, risk, performance, TypeScript errors, connections, migrations
> Generated: 2026-02-22 | NO changes made — research only

---

## Table of Contents

1. [Codebase Overview](#1-codebase-overview)
2. [TypeScript Errors](#2-typescript-errors)
3. [Performance Risks](#3-performance-risks)
4. [Security Risks](#4-security-risks)
5. [Code Quality](#5-code-quality)
6. [Frontend-Backend-Admin Connections](#6-frontend-backend-admin-connections)
7. [Prisma & Migrations](#7-prisma--migrations)
8. [Dependency Versions](#8-dependency-versions)
9. [Priority Action Items](#9-priority-action-items)

---

## 1. Codebase Overview

| Metric | Frontend | Backend | Admin |
|--------|----------|---------|-------|
| **Framework** | Next.js 15 / React 19 | NestJS 11 | CRA / React 18 |
| **Language** | TypeScript 5.9 | TypeScript 5.9 | TypeScript 4.9 |
| **Port** | 4001 | 3000 | 3001 |
| **Total TS/TSX files** | 633 | 160 | 245 |
| **TS errors** | 577 | 0 | 41 |
| **Files > 500 lines** | 17 | 15 | 18 |
| **`any` type usage** | 1,639 | 1,544 | 678 |
| **console.log files** | 2 | 0 (seed only) | 33 |
| **dangerouslySetInnerHTML** | 13 | n/a | 6 |

### Total Lines of Code (Largest Files)

**Backend God Files:**
| File | Lines | Risk |
|------|-------|------|
| `product.service.ts` | 12,262 | CRITICAL |
| `user.service.ts` | 4,925 | HIGH |
| `admin.service.ts` | 4,688 | HIGH |
| `order.service.ts` | 4,681 | HIGH |
| `product.controller.ts` | 3,151 | MEDIUM |
| `cart.service.ts` | 2,323 | MEDIUM |
| `payment.service.ts` | 2,150 | MEDIUM |

**Frontend Large Files:**
| File | Lines |
|------|-------|
| `SellerChat.tsx` | 2,830 |
| `trending/page.tsx` | 2,603 |
| `RfqRequestChat.tsx` | 2,483 |
| `product/page.tsx` | 2,357 |
| `Header.tsx` | 2,353 |
| `BulkEditSidebar.tsx` | 2,136 |
| `checkout/page.tsx` | 1,976 |

---

## 2. TypeScript Errors

### Frontend: 577 errors

| Error Code | Count | Description |
|-----------|-------|-------------|
| TS2339 | 335 | Property does not exist on type |
| TS2322 | 63 | Type not assignable |
| TS7006 | 42 | Parameter implicitly has 'any' type |
| TS2345 | 29 | Argument type not assignable |
| TS18046 | 25 | Variable is of type 'unknown' |
| TS2353 | 21 | Object literal may only specify known properties |
| TS2305 | 21 | Module has no exported member |
| TS2769 | 7 | No overload matches this call |
| TS18048 | 6 | Variable is possibly undefined |
| TS7016 | 5 | Could not find declaration file |
| Others | 23 | Various minor errors |

**Root causes:**
- Heavy `any` usage (1,639 instances) masks type issues
- Missing/incomplete type definitions for API responses
- Props types not matching component expectations

### Backend: 0 errors
Backend compiles clean with no TypeScript errors.

### Admin: 41 errors

| Error Code | Count | Description |
|-----------|-------|-------------|
| TS2339 | 37 | Property does not exist on type |
| TS2305 | 2 | Module has no exported member |
| TS2769 | 1 | No overload matches this call |
| TS2551 | 1 | Property does not exist (did you mean?) |

---

## 3. Performance Risks

### CRITICAL: N+1 Queries in Backend

**File:** `src/product/product.service.ts`

The product service has **30+ locations** with N+1 query patterns — loops executing individual `prisma.create()` calls instead of batch operations.

**Worst offenders:**

```
Line 259-261:  Loop creating product tags one by one
Line 275-277:  Loop creating category maps one by one
Line 300-302:  Loop creating spec values one by one
Line 315-318:  Loop creating product images one by one
Line 335-586:  Nested loops for pricing + country/state/city (3 levels deep!)
Line 525-548:  Loop sending notifications to all users individually
Line 653-663:  Loop creating product descriptions
Line 671-681:  Loop creating product specifications
Line 3271-3365: Wishlist notification loops (duplicated 4 times)
```

**Impact:** A single product creation can trigger 20-40+ individual DB queries instead of 3-5 batch operations. Under load, this causes severe performance degradation.

**Fix:** Use `prisma.createMany()` for bulk inserts, or `Promise.all()` for parallel execution.

### MEDIUM: Full Lodash Import

**Frontend:** `app/login/page.tsx` — `import _ from 'lodash'` (imports entire ~100KB library)
**Admin:** 7 files importing full lodash

**Fix:** Use `import { get } from 'lodash'` or switch to `lodash-es` for tree-shaking.

### PASS: Image Optimization
Frontend properly uses Next.js `<Image>` component — no raw `<img>` tags found.

### PASS: React Key Props
No missing `key` props detected in `.map()` renders.

---

## 4. Security Risks

### MEDIUM: dangerouslySetInnerHTML (19 instances)

**Frontend (13 instances):**
- `trending/[id]/page.tsx` — product descriptions
- `Header.tsx` — layout content
- `PlateEditor.tsx`, `PlateEditorSimple.tsx` — rich text editors
- `SellerChatHistory.tsx`, `RfqRequestChatHistory.tsx`, `ProductChatHistory.tsx` — chat messages
- `rfq/[id]/page.tsx`, `factories/[id]/page.tsx` — detail pages

**Admin (6 instances):**
- `ServiceDetails.tsx`, `ProductsDetail.tsx` — detail views
- `ExistingProductDetail.tsx`, `DropshipableProductDetail.tsx` — detail views
- `TermConditionModal.tsx` — terms display

**Risk:** XSS vulnerability if user-generated content is rendered without sanitization.
**Fix:** Add DOMPurify sanitization before rendering.

### PASS: No Hardcoded Secrets
No API keys, passwords, or secrets found in source code. All sensitive values use environment variables.

### PASS: .env in .gitignore
All 3 repos properly exclude `.env` files from git.

### PASS: No SQL Injection Risk
All database queries use Prisma ORM with parameterized queries. No raw SQL detected.

### LOW: Test Auth Bypass Flag
Backend `.env` has `ENABLE_TEST_AUTH_BYPASS` — must be disabled in production.

---

## 5. Code Quality

### Code Duplication (Backend)

The following patterns are duplicated multiple times in `product.service.ts`:

| Pattern | Occurrences | Lines |
|---------|-------------|-------|
| Product tag creation loop | 2x | 259-261, 975-987 |
| Product image creation loop | 2x | 315-318, 991-1003 |
| Product spec creation loop | 2x | 671-681, 1040-1050 |
| Short description creation loop | 2x | 653-663, 1018-1028 |
| Wishlist notification loop | 4x | 3271, 3352, 4642, 4720 |
| Review rating calculation | 4x | 5772, 6024, 6243, 6455 |

### TODO/FIXME Comments

**Backend (critical):**
- `admin.service.ts:2164` — "TODO: Implement proper audit table persistence"
- `product.service.ts:3869` — "TODO: Fix mapping between Countries and CountryList tables"
- `product.service.ts:3894` — "Place of origin temporarily disabled"

**Frontend:** 18 files with TODO markers
**Admin:** 9 files with TODO markers

### Console.log Cleanup
- **Frontend:** 2 files (commented out — OK)
- **Admin:** 33 files still have console.log — needs cleanup
- **Backend:** 0 in source (only in seed scripts — OK)

---

## 6. Frontend-Backend-Admin Connections

### API Configuration

| App | Base URL | Auth Method | Status |
|-----|----------|-------------|--------|
| Frontend | `http://localhost:3000/api/v1` | Bearer JWT (cookie) | OK |
| Admin | `http://localhost:3000/api/v1/` | Bearer JWT (cookie) | OK |
| Backend | Listens on `:3000` | JWT validation | OK |

### CORS Configuration (Backend `main.ts`)

```
Origins: localhost:4001, localhost:3001, localhost:3000
Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Credentials: true
```

Status: OK — all 3 apps whitelisted.

### Authentication Flow

1. User logs in → Backend returns JWT token
2. Token stored in HTTP-only cookie (`puremoon_accessToken`)
3. All API requests attach `Authorization: Bearer {token}` header
4. Backend validates JWT on protected routes via `AuthGuard`
5. Token expiry: 1 hour (configurable via `JWT_EXPIRY`)

### API Endpoint Alignment

| Area | Frontend Calls | Backend Routes | Status |
|------|---------------|----------------|--------|
| Product CRUD | 40+ endpoints | All implemented | OK |
| Orders | 6+ endpoints | All implemented | OK |
| Cart | 12+ endpoints | All implemented | OK |
| User/Auth | 15+ endpoints | All implemented | OK |
| Chat | 10+ endpoints | All implemented | OK |
| Wallet (user) | 7 endpoints | All implemented | OK |
| Wallet (admin) | 3 endpoints | NOT FOUND | MISSING |
| Dropship | 10+ endpoints | All implemented | OK |

### MISSING Backend Routes

| Frontend/Admin Calls | Expected Backend Route | Status |
|---------------------|----------------------|--------|
| Admin wallet list | `GET /admin/wallets` | NOT FOUND |
| Admin wallet status | `PUT /admin/wallets/{id}/status` | NOT FOUND |
| Admin transactions | `GET /admin/transactions` | NOT FOUND |

---

## 7. Prisma & Migrations

### Migration Status

```
41 migrations found in prisma/migrations
Database schema is up to date!
No drift detected.
```

### Schema Summary

- **Total models:** 122
- **Total migrations:** 50 (including baselines)
- **Schema drift:** None (clean)

### Key Models (by feature area)

| Area | Models | Count |
|------|--------|-------|
| User/Auth | User, RefreshToken, MasterAccount, UserRole, UserProfile, etc. | 15 |
| Product | Product, ProductPrice, ProductVariant, ProductImages, ProductTags, etc. | 22 |
| Order | Order, OrderSeller, OrderProducts, OrderShipping, OrderEMI, etc. | 9 |
| Cart | Cart, CartServiceFeature, CartProductService, RFQCart, FactoriesCart | 5 |
| Category | Category, CategoryConnectTo, CategoryKeyword, CategoryTag | 4 |
| Chat | Room, Message, ChatAttachments, RoomParticipants | 4 |
| Payment | TransactionPaymob, PaymentErrorLog | 2 |
| Wallet | Wallet, WalletTransaction, WalletTransfer, WalletSettings | 4 |
| Admin | AdminPermission, AdminRole, AdminRolePermission, AdminMember | 4 |
| Fees | Fees, FeesDetail, FeesToFeesDetail, FeesLocation, FeesCountry, etc. | 8 |
| Other | Brand, Tags, Service, Banner, Policy, Notification, etc. | 45 |

### DB Tables with Data (Local)

| Table | Rows | Category |
|-------|------|----------|
| system_log | 8,066 | Transient |
| category_tag | 3,730 | Reference |
| spec_template | 2,041 | Reference |
| Category | 513 | Reference |
| Tags | 280 | Reference |
| category_keyword | 263 | Reference |
| RefreshToken | 89 | Transient |
| product_spec_value | 87 | Content |
| Product | 36 | Content |
| ProductImages | 34 | Content |
| ProductPrice | 30 | Content |
| User | 18 | Core |
| MasterAccount | 17 | Core |
| product_category_map | 16 | Content |
| ProductView | 8 | Transient |
| ProductVariant | 7 | Content |
| Wallet | 5 | Core |
| Notification | 4 | Transient |
| WalletSettings | 3 | Core |
| Brand | 2 | Reference |
| AccountSession | 1 | Transient |

---

## 8. Dependency Versions

### Frontend
| Package | Version | Notes |
|---------|---------|-------|
| next | 15.5.12 | Latest |
| react | 19.1.1 | Latest |
| typescript | ^5.9.2 | Latest |
| tailwindcss | 4.1.13 | Latest (v4) |
| @tanstack/react-query | ^5.87.4 | Latest |
| axios | ^1.12.2 | Latest |
| next-auth | ^4.24.11 | v4 (v5 available) |
| zod | ^4.1.8 | Latest |

### Backend
| Package | Version | Notes |
|---------|---------|-------|
| @nestjs/core | ^11.1.6 | Latest |
| @prisma/client | ^6.16.1 | Latest |
| typescript | ^5.9.2 | Latest |
| socket.io | ^4.8.1 | Latest |
| @nestjs/jwt | ^11.0.0 | Latest |
| class-validator | ^0.14.2 | Latest |

### Admin
| Package | Version | Notes |
|---------|---------|-------|
| react | ^18.3.1 | One major behind frontend |
| typescript | ^4.9.5 | TWO majors behind (5.9 in FE/BE) |
| react-scripts | ^5.0.1 | CRA (consider migration to Vite) |
| @mui/material | ^5.16.7 | Latest v5 |
| axios | ^1.13.5 | Latest |

**Version Mismatch Risk:**
- Admin uses **React 18** while Frontend uses **React 19** — shared components won't be compatible
- Admin uses **TypeScript 4.9** while others use **5.9** — different type features available
- Admin uses **CRA** which is deprecated — should migrate to Vite or Next.js

---

## 9. Priority Action Items

### CRITICAL (Fix Now)
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | N+1 query patterns (30+ locations) | `product.service.ts` | DB overload under load |
| 2 | `product.service.ts` is 12,262 lines | Backend | Unmaintainable |
| 3 | 577 TypeScript errors | Frontend | Type safety broken |

### HIGH (Fix Soon)
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | Missing admin wallet API routes | Backend | Feature broken |
| 5 | 19x dangerouslySetInnerHTML without sanitization | FE + Admin | XSS risk |
| 6 | 1,639 + 1,544 + 678 = 3,861 `any` usages | All repos | Type safety |
| 7 | Variant system bugs (see VARIANT-SYSTEM.md) | FE + BE | User-facing bug |

### MEDIUM (Plan For)
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 8 | Admin TypeScript version (4.9 vs 5.9) | Admin | Dev experience |
| 9 | Admin CRA → Vite migration | Admin | Build performance |
| 10 | 33 console.log files in admin | Admin | Cleanup |
| 11 | Full lodash imports (8 files) | FE + Admin | Bundle size +100KB |
| 12 | Code duplication in product.service.ts | Backend | Maintainability |
| 13 | Admin React 18 vs Frontend React 19 | Admin | Compatibility |

### LOW (Nice to Have)
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 14 | 27 TODO/FIXME comments | All repos | Tech debt |
| 15 | next-auth v4 → v5 upgrade | Frontend | Future-proofing |
| 16 | Country/CountryList table mapping TODO | Backend | Data integrity |
