# Variant UI Study — Taobao-Style Chip Selector

> Reference: User-provided screenshot of Taobao/JD-style product variant selector
> Date: 2026-02-22

---

## 1. Reference UI Analysis

The reference screenshot shows a modern e-commerce variant selector with these patterns:

### Color Variants (With Image Thumbnails)
```
┌─────────────────────────────────────────────────────┐
│  颜色 (Color)                                        │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ [img]    │  │ [img]    │  │ [img]    │          │
│  │ Velvet   │  │ Magnolia │  │ Sky      │          │
│  │ Black    │  │ Purple   │  │ Blue     │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│  ┌──────────────┐                                   │
│  │ [img]        │  ← selected (orange border)       │
│  │ moon shadow  │                                   │
│  │ white        │                                   │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

**Key features:**
- Each color chip shows a small product image thumbnail
- Selected chip has orange/highlight border
- Chips flow horizontally and wrap to next line
- Text label below image

### Storage/Spec Variants (Text Chips)
```
┌─────────────────────────────────────────────────────┐
│  存储容量 (Storage Capacity)                         │
│                                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ 8GB+256GB  │  │ 12GB+256GB │  │ 12GB+512GB │    │
│  └────────────┘  └────────────┘  └────────────┘    │
│                                                     │
│  套餐类型 (Package Type)                             │
│  ┌──────────────────────────┐                       │
│  │ Official standard config │  ← selected           │
│  └──────────────────────────┘                       │
│                                                     │
│  网络类型 (Network Type)                             │
│  ┌──────────────────────────────────┐               │
│  │ 5G full network compatibility   │  ← selected    │
│  └──────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

**Key features:**
- Text-only chips (no images)
- Outlined/bordered buttons
- Selected state = filled/highlighted
- One selection per type (radio-like)
- "Recently popular" badge on some options

### Action Buttons
```
┌────────────────────────┐ ┌────────────────────────┐
│   🛒 Add to Cart       │ │  💰 Purchase w/ Coupon │
└────────────────────────┘ └────────────────────────┘
```

---

## 2. Current Ultrasooq Implementation

### What We Have Now
```
┌─────────────────────────────────────────────────────┐
│  Color:    [▼ Red          ]   ← HTML <select>      │
│  Size:     [▼ M            ]   ← HTML <select>      │
└─────────────────────────────────────────────────────┘
```

**Problems with current approach:**
1. Dropdowns hide all options — user must click to see them
2. No visual preview of colors (no image thumbnails)
3. No visual indication of "active" vs "available"
4. Poor mobile UX — dropdowns are hard to tap
5. No support for variant images in the selector
6. Boring, generic UI — doesn't feel like a modern marketplace


---

## 3. What Needs to Change

### A. Database / Backend — NO CHANGES NEEDED for UI

The current data model already supports this UI:
- `ProductVariant.object` = `{type: "Color", value: "Red"}` — works for chip labels
- `ProductImages` with `variant: {type, value}` — works for chip thumbnails
- Selected variant state is already managed correctly in the flow

The only backend bugs (from VARIANT-SYSTEM.md) need fixing regardless:
- BUG 1: Backend creates ONE row instead of individual rows
- These bugs are separate from the UI change

### B. Frontend — ProductDescriptionCard.tsx

**Replace:** `<select>` dropdown (lines 636-709)
**With:** Chip/button grid component

### C. Data Already Available

| Need | Data Source | Status |
|------|------------|--------|
| Variant type names | `productVariantTypes` array | ✅ Available |
| Variant values per type | `productVariants.filter(v => v.type === type)` | ✅ Available |
| Selected variant per type | `selectedProductVariant` | ✅ Available |
| Variant images | `productDetails.product_productImages` with `variant` field | ✅ Available |
| Selection callback | `selectProductVariant(variants)` | ✅ Available |

---

## 4. New Component Design

### VariantChipSelector Component

```
Props:
  productVariantTypes: string[]        // ["Color", "Size", "Storage"]
  productVariants: {type,value}[]      // flat list of all variants
  selectedVariants: {type,value}[]     // currently selected (one per type)
  variantImages: ProductImage[]        // images with variant field
  onVariantChange: (variants) => void  // callback
```

### Rendering Logic

```
For each type in productVariantTypes:
  ┌─────────────────────────────────────────────┐
  │  {type label}                                │
  │                                             │
  │  For each variant where variant.type == type:│
  │                                             │
  │  IF variant has image (Color type):          │
  │    ┌──────────┐                             │
  │    │ [thumb]  │  ← 48x48 image              │
  │    │ {value}  │  ← text label               │
  │    └──────────┘                             │
  │    border: selected ? orange : gray          │
  │                                             │
  │  ELSE (text-only chip):                      │
  │    ┌──────────────┐                         │
  │    │   {value}    │  ← text label            │
  │    └──────────────┘                         │
  │    bg: selected ? orange/light : white       │
  │    border: selected ? orange : gray          │
  │                                             │
  └─────────────────────────────────────────────┘
```

### Image Matching Logic

To find the image for a variant chip:
```typescript
const getVariantImage = (type: string, value: string) => {
  return productImages?.find(img => 
    img.variant?.type === type && 
    img.variant?.value === value
  )?.url;
};
```

If no variant-specific image exists, show text-only chip.

---

## 5. Tailwind CSS Classes

### Image Chip (Color variant)
```
Container: flex flex-wrap gap-3
Chip:      relative cursor-pointer rounded-lg border-2 p-1
           transition-all duration-200
           hover:shadow-md
Selected:  border-orange-500 ring-2 ring-orange-200
Default:   border-gray-200 hover:border-gray-400
Image:     w-12 h-12 rounded object-cover
Label:     text-xs text-center mt-1 max-w-[60px] truncate
```

### Text Chip (Size, Storage, etc.)
```
Chip:      cursor-pointer rounded-lg border-2 px-4 py-2
           text-sm font-medium transition-all duration-200
           hover:shadow-sm
Selected:  border-orange-500 bg-orange-50 text-orange-700
Default:   border-gray-200 bg-white text-gray-700
           hover:border-gray-400
```

---

## 6. Implementation Files

| File | Action | What Changes |
|------|--------|-------------|
| `components/modules/productDetails/VariantChipSelector.tsx` | **CREATE** | New chip selector component |
| `components/modules/productDetails/ProductDescriptionCard.tsx` | **MODIFY** | Replace `<select>` with `<VariantChipSelector>` |
| No backend changes | — | Data model already supports this |
| No API changes | — | Same data, different rendering |

### Step-by-step:

1. Create `VariantChipSelector.tsx` with the chip UI
2. In `ProductDescriptionCard.tsx`:
   - Import `VariantChipSelector`
   - Pass variant images from product data
   - Replace the `productVariantTypes?.map(...)` block (lines 636-709) with `<VariantChipSelector>`
3. Fix BUG 2 at the same time: remove local `selectedProductVariants` state, use only props

---

## 7. Mobile Responsiveness

The chip design is inherently mobile-friendly:
- Chips wrap to next line on small screens (`flex-wrap`)
- Touch targets are larger than dropdowns
- Visual selection state is obvious
- Image chips can be smaller on mobile: `w-10 h-10` → `w-12 h-12`

---

## 8. Summary

| Aspect | Current (Dropdown) | Target (Chips) |
|--------|-------------------|----------------|
| UI Pattern | `<select>` dropdown | Clickable chip buttons |
| Color Preview | None | Image thumbnail in chip |
| Selection Visual | Dropdown text | Orange border/highlight |
| Mobile UX | Poor (tiny tap targets) | Good (large touch targets) |
| All Options Visible | No (hidden in dropdown) | Yes (all visible at once) |
| Backend Changes | — | None needed |
| API Changes | — | None needed |
| Data Model | — | Already supports images per variant |
