# Scraper Service

A comprehensive web scraping service for extracting product data from various e-commerce platforms like Amazon.in and Taobao.com.

## Features

- **Multi-Platform Support**: Scrape products from Amazon.in, Taobao.com, and easily add more platforms
- **Product & Search Scraping**: Extract detailed product information and search results
- **Type-Safe**: Full TypeScript support with well-defined interfaces
- **Product Model Compatible**: Data structures map directly to the existing Product model
- **Dropshipping Support**: Built-in support for dropshipping with markup calculations
- **Error Handling**: Robust error handling and logging
- **Browser Automation**: Uses Puppeteer for reliable scraping

## Installation

The required dependencies are already installed in the project:
- `puppeteer` - Browser automation

## Usage

### 1. Import the Module

Add the `ScraperModule` to your NestJS module:

```typescript
import { Module } from '@nestjs/common';
import { ScraperModule } from './services/scraper/scraper.module';

@Module({
  imports: [ScraperModule],
})
export class AppModule {}
```

### 2. Inject the Service

```typescript
import { Injectable } from '@nestjs/common';
import { ScraperService } from './services/scraper';

@Injectable()
export class ProductService {
  constructor(private readonly scraperService: ScraperService) {}

  async scrapeProduct(url: string) {
    const scrapedProduct = await this.scraperService.scrapeProduct(url);
    return scrapedProduct;
  }

  async scrapeSearch(url: string) {
    const searchResults = await this.scraperService.scrapeSearch(url);
    return searchResults;
  }
}
```

### 3. Use the Mapper to Create Products

```typescript
import { ScrapedProductMapper } from './services/scraper/utils/scraped-product.mapper';

// Scrape a product
const scrapedProduct = await this.scraperService.scrapeProduct(
  'https://www.amazon.in/dp/PRODUCT_ID'
);

// Convert to Product DTO
const productDto = ScrapedProductMapper.toCreateProductDto(
  scrapedProduct,
  userId, // The user creating the product
  {
    categoryId: 123,
    brandId: 456,
    placeOfOriginId: 1, // India
    status: 'ACTIVE',
  }
);

// Create product in database
await this.prisma.product.create({
  data: {
    ...productDto,
    skuNo: ScrapedProductMapper.generateSKU(scrapedProduct),
    // ... other fields
  }
});
```

### 4. Dropshipping Example

```typescript
// Scrape original product
const originalProduct = await this.scraperService.scrapeProduct(
  'https://www.amazon.in/dp/ORIGINAL_PRODUCT'
);

// Create as dropship product with markup
const dropshipDto = ScrapedProductMapper.toDropshipProductDto(
  originalProduct,
  originalProductId,
  vendorId,
  25, // 25% markup
  {
    categoryId: 123,
    brandId: 456,
    customMarketingContent: {
      customDescription: 'My custom product description',
    },
  }
);

// Create dropship product
await this.prisma.product.create({
  data: {
    ...dropshipDto,
    skuNo: ScrapedProductMapper.generateSKU(originalProduct, 'DROPSHIP'),
  }
});
```

## Supported Platforms

### Amazon.in ✅ (Fully Implemented)

Scrapes:
- Product name, description, and specifications
- Pricing (current price and original price)
- Product images
- Brand information
- Ratings and reviews
- Stock availability
- ASIN (product identifier)

Example URLs:
- Product: `https://www.amazon.in/dp/B08N5WRWNW`
- Search: `https://www.amazon.in/s?k=laptop`

### Taobao.com ⚠️ (Basic Implementation)

**Note**: Taobao has strong anti-scraping measures. The current implementation is a placeholder and may require:
- CAPTCHA solving services
- Cookie/session management
- Proxy rotation
- More sophisticated anti-detection measures

## API Reference

### ScraperService

#### `scrapeProduct(url: string): Promise<ScrapedProduct>`

Scrapes detailed product information from a URL.

**Returns**: `ScrapedProduct` object with:
- `productName`: Product title
- `description`: Full product description
- `shortDescription`: Brief description
- `productPrice`: Current selling price
- `offerPrice`: Original price (if on sale)
- `brandName`: Product brand
- `images`: Array of product images
- `specifications`: Array of product specifications
- `rating`: Product rating
- `reviewCount`: Number of reviews
- `inStock`: Availability status
- `sourceUrl`: Original URL
- `sourcePlatform`: Platform name
- And more...

#### `scrapeSearch(url: string): Promise<ScrapedSearchResult>`

Scrapes search results from a URL.

**Returns**: `ScrapedSearchResult` object with:
- `products`: Array of `ScrapedProductSummary`
- `totalResults`: Total number of results
- `currentPage`: Current page number
- `searchQuery`: The search URL

### ScrapedProductMapper

#### `toCreateProductDto(scrapedProduct, userId, options)`

Converts scraped product data to a format compatible with the Product model.

**Parameters**:
- `scrapedProduct`: The scraped product data
- `userId`: User ID creating the product
- `options`: Optional configuration
  - `categoryId`: Product category
  - `brandId`: Brand ID
  - `placeOfOriginId`: Country of origin
  - `adminId`: Admin ID
  - `status`: Product status ('ACTIVE' | 'INACTIVE')
  - `markupPercentage`: Price markup percentage

#### `toDropshipProductDto(scrapedProduct, originalProductId, vendorId, markupPercentage, options)`

Creates a dropshipping product DTO.

**Parameters**:
- `scrapedProduct`: The scraped product data
- `originalProductId`: ID of the original product
- `vendorId`: Dropship vendor ID
- `markupPercentage`: Markup percentage
- `options`: Additional options

#### `generateSKU(scrapedProduct, prefix)`

Generates a unique SKU for the product.

## Adding New Scraper Providers

To add support for a new e-commerce platform:

1. Create a new provider file in `src/services/scraper/providers/`

```typescript
import { Logger } from '@nestjs/common';
import { ScraperProvider } from '../scraper.service';
import { ScrapedProduct, ScrapedSearchResult } from '../interfaces/scraped-product.interface';

export class NewPlatformScraperProvider implements ScraperProvider {
    private readonly logger = new Logger(NewPlatformScraperProvider.name);

    canScrape(url: string): boolean {
        // Check if URL is from your platform
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === 'newplatform.com' || hostname.endsWith('.newplatform.com');
    }

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        // Implementation here
    }

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        // Implementation here
    }
}
```

2. Register the provider in `scraper.module.ts`

```typescript
import { NewPlatformScraperProvider } from './providers/newplatform.scraper.provider';

@Module({
    providers: [
        ScraperService,
        AmazonINScraperProvider,
        TaobaoScraperProvider,
        NewPlatformScraperProvider, // Add here
    ],
    exports: [ScraperService],
})
export class ScraperModule implements OnModuleInit {
    constructor(
        private readonly scraperService: ScraperService,
        private readonly amazonProvider: AmazonINScraperProvider,
        private readonly taobaoProvider: TaobaoScraperProvider,
        private readonly newPlatformProvider: NewPlatformScraperProvider, // Add here
    ) {}

    onModuleInit() {
        this.scraperService.registerProviders([
            this.amazonProvider,
            this.taobaoProvider,
            this.newPlatformProvider, // Add here
        ]);
    }
}
```

## Product Model Mapping

The scraper data maps to the Product model as follows:

| Scraped Field | Product Model Field | Type | Notes |
|--------------|---------------------|------|-------|
| `productName` | `productName` | String | Direct mapping |
| `productPrice` | `productPrice` | Decimal | Current price |
| `offerPrice` | `offerPrice` | Decimal | Original/offer price |
| `description` | `description` | String | Full description |
| `shortDescription` | `shortDescription` | String | Brief description |
| `brandName` | `brandId` | Int | Requires brand lookup/creation |
| `barcode` | `barcode` | String | ASIN, UPC, etc. |
| `images` | `ProductImages` | Relation | Saved as separate records |
| `specifications` | `ProductSpecification` | Relation | Saved as separate records |
| `placeOfOrigin` | `placeOfOriginId` | Int | Requires country lookup |
| `productType` | `productType` | Enum | PHYSICAL or DIGITAL |
| `typeOfProduct` | `typeOfProduct` | Enum | NEW, USED, REFURBISHED |
| `tags` | `ProductTags` | Relation | Saved as separate records |

## Error Handling

The scraper service includes comprehensive error handling:

```typescript
try {
  const product = await scraperService.scrapeProduct(url);
} catch (error) {
  if (error.message.includes('No suitable scraper provider')) {
    // URL not supported
  } else if (error.message.includes('Failed to scrape')) {
    // Scraping error (timeout, network, etc.)
  }
}
```

## Logging

The service uses NestJS Logger for detailed logging:
- Provider registration
- Scraping attempts
- Success/failure status
- Error details

Check your logs to monitor scraping activity.

## Best Practices

1. **Rate Limiting**: Implement rate limiting to avoid overwhelming target websites
2. **Caching**: Cache scraped data to reduce redundant requests
3. **Error Handling**: Always wrap scraper calls in try-catch blocks
4. **Product Review**: Set scraped products to 'INACTIVE' status for manual review
5. **Data Validation**: Validate scraped data before saving to database
6. **Legal Compliance**: Ensure scraping complies with website terms of service
7. **User Agents**: Scraper uses realistic user agents to avoid detection

## Troubleshooting

### Issue: "No suitable scraper provider found"
**Solution**: The URL is not supported. Check if the provider exists and is registered.

### Issue: Scraping times out
**Solution**: Increase timeout values or check internet connection.

### Issue: Empty or missing data
**Solution**: Website structure may have changed. Update selectors in the provider.

### Issue: CAPTCHA challenges
**Solution**: Some sites (like Taobao) require CAPTCHA solving services. Consider using services like 2Captcha.

## Future Enhancements

- [ ] Add more e-commerce platforms (eBay, AliExpress, etc.)
- [ ] Implement CAPTCHA solving
- [ ] Add proxy support for IP rotation
- [ ] Implement caching layer
- [ ] Add rate limiting
- [ ] Background job queue for scraping
- [ ] Webhook notifications for scraping completion
- [ ] Scheduled scraping for price monitoring

## License

This scraper service is part of the UltraSooq Backend project.
