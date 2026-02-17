# Scraper API - New Endpoints Documentation

## Overview
Two new endpoints have been added to the scraper service for listing and auto-listing products from scraped URLs.

## Endpoints

### 1. POST /scraper/list
Scrape a search results page and return a list of products with their titles and images.

#### Request Body
```json
{
  "url": "https://www.amazon.in/s?k=ddr4+32gb&i=electronics&crid=3DWWI5D7QDKS3&sprefix=%2Celectronics%2C332&ref=nb_sb_ss_recent_2_0_recent"
}
```

#### Response
```json
{
  "products": [
    {
      "productName": "Product Title",
      "image": "https://example.com/image.jpg",
      "productUrl": "https://example.com/product",
      "productPrice": 1999.99,
      "offerPrice": 1599.99,
      "rating": 4.5,
      "reviewCount": 1234,
      "inStock": true
    }
  ],
  "totalResults": 50,
  "currentPage": 1,
  "totalPages": 5,
  "searchQuery": "ddr4 32gb"
}
```

---

### 2. POST /scraper/list-product
Scrape a product page and optionally auto-list it to the **ExistingProduct** table.

#### Request Body
```json
{
  "url": "https://amzn.in/d/61zYF5m",
  "categoryId": 1,
  "autolist": true,
  "brandId": 1,
  "placeOfOriginId": 1,
  "productType": "P",
  "tagIds": [1, 2, 3]
}
```

#### Parameters
- `url` (required): Product URL to scrape
- `categoryId` (required): Category ID for the product
- `autolist` (optional, default: false): Whether to automatically create the product in the ExistingProduct table
- `brandId` (optional): Brand ID for the product
- `placeOfOriginId` (optional): Place of origin ID for the product
- `productType` (optional): Product type (P: Product, R: RFQ, F: Factory, D: Dropship). Default: "P"
- `tagIds` (optional): Array of tag IDs to associate with the product

#### Response (when autolist=false)
```json
{
  "scrapedData": {
    "productName": "Product Name",
    "productPrice": 1999.99,
    "offerPrice": 1599.99,
    "description": "Product description",
    "images": [...],
    "specifications": [...]
  },
  "autoListed": false,
  "message": "Product scraped successfully (not auto-listed)",
  "preview": {
    "productName": "Product Name",
    "prices": {
      "productPrice": 1999.99,
      "offerPrice": 1599.99
    },
    "imagesCount": 5,
    "hasDescription": true,
    "hasSpecification": true
  }
}
```

#### Response (when autolist=true)
```json
{
  "scrapedData": {...},
  "autoListed": true,
  "product": {
    "id": 123,
    "productName": "Product Name",
    "categoryId": 1,
    "brandId": 1,
    "productType": "P",
    "status": "INACTIVE",
    ...
  },
  "message": "Product scraped and listed successfully to ExistingProduct"
}
```

**Note:** Products are created in the `ExistingProduct` table with status `INACTIVE` for review before being moved to the main Product table.

## Authentication

- **POST /scraper/list**: No authentication required
- **POST /scraper/list-product** (with autolist=true): Requires JWT authentication
- **POST /scraper/list-product** (with autolist=false): No authentication required

## Usage Examples

### Example 1: List products from search
```bash
curl -X POST http://localhost:3000/scraper/list \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.amazon.in/s?k=laptop"
  }'
```

### Example 2: Scrape product without auto-listing
```bash
curl -X POST http://localhost:3000/scraper/list-product \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://amzn.in/d/61zYF5m",
    "categoryId": 1,
    "autolist": false
  }'
```

### Example 3: Scrape and auto-list product
```bash
curl -X POST http://localhost:3000/scraper/list-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "url": "https://amzn.in/d/61zYF5m",
    "categoryId": 1,
    "autolist": true,
    "brandId": 1,
    "placeOfOriginId": 1
  }'
```

## Notes

1. **Supported Platforms**: Currently supports Amazon India (amazon.in) and Taobao
2. **Product Status**: Auto-listed products are created with status='INACTIVE' for review
3. **SKU Generation**: A unique SKU is automatically generated for each product
4. **Images**: Product images are included in the scraped data
5. **Specifications**: Product specifications are extracted when available

## Error Handling

### Common Errors

- **400 Bad Request**: Invalid URL or scraping failed
  ```json
  {
    "statusCode": 400,
    "message": "Failed to scrape product: No suitable scraper provider found for the URL"
  }
  ```

- **401 Unauthorized**: User authentication required for auto-listing
  ```json
  {
    "statusCode": 401,
    "message": "User authentication required for auto-listing products"
  }
  ```

## Testing

Use the provided `test-requests.http` file with VS Code REST Client extension to test the endpoints.

## Files Modified/Created

1. `src/services/scraper/dto/scrape-list.dto.ts` - DTO for list endpoint
2. `src/services/scraper/dto/list-product.dto.ts` - DTO for list-product endpoint
3. `src/services/scraper/dto/index.ts` - Export file for DTOs
4. `src/services/scraper/scraper.controller.ts` - Added new endpoints
5. `src/services/scraper/scraper.module.ts` - Added ProductService injection
6. `src/services/scraper/test-requests.http` - Updated with new test cases
