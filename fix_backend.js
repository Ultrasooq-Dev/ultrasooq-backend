/**
 * @file fix_backend.js — One-time migration/patch script.
 *
 * @intent
 *   Patches the product.service.ts file to add missing discount type fields
 *   (`vendorDiscountType`, `consumerDiscountType`) to the
 *   `updateMultipleProductPrice` function's Prisma update call.
 *
 * @idea
 *   This is a one-off code-fix script that modifies source code via regex
 *   replacement. It was likely created to apply a hotfix to the
 *   product pricing update logic without manual file editing.
 *
 * @usage
 *   Run once from the backend project root:
 *   ```
 *   node fix_backend.js
 *   ```
 *
 * @dataflow
 *   1. Reads `src/product/product.service.ts` from disk.
 *   2. Uses a regex to find the `consumerDiscount` line in the
 *      `updateMultipleProductPrice` function.
 *   3. Appends `vendorDiscountType` and `consumerDiscountType` fields
 *      immediately after the matched line.
 *   4. Writes the modified content back to disk.
 *
 * @depends
 *   - Node.js `fs` module.
 *   - Expects to be run from the backend project root directory.
 *
 * @notes
 *   - This is a one-time patch script; it should not be run repeatedly.
 *   - Uses regex-based source code modification — fragile if the target
 *     code has already been modified or reformatted.
 *   - The fix adds two missing fields to the Prisma `update` data object
 *     so that vendor/consumer discount types are preserved during
 *     multi-product-price updates.
 */
const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/product/product.service.ts', 'utf8');

// Find the consumerDiscount line in updateMultipleProductPrice function
const consumerDiscountRegex = /(\s+consumerDiscount:\s+payload\?\.\productPrice\[i\]\?\.\consumerDiscount \|\|\s+existProductPrice\?\.\consumerDiscount,)/;

// Replace with the same line plus the missing fields
const replacement = `$1

                vendorDiscountType:
                  payload?.productPrice[i]?.vendorDiscountType ||
                  existProductPrice?.vendorDiscountType,

                consumerDiscountType:
                  payload?.productPrice[i]?.consumerDiscountType ||
                  existProductPrice?.consumerDiscountType,`;

// Apply the replacement
content = content.replace(consumerDiscountRegex, replacement);

// Write back to file
fs.writeFileSync('src/product/product.service.ts', content);

console.log('Fixed backend service - added missing discount type fields');
