# Quick Start Guide - Scraper Service

Get started with the scraper service in 5 minutes!

## ⚠️ Important Note

The `examples.ts` file is for **reference only** - do not run it directly! 

To test the scraper, use one of these methods:
1. **Use the REST API** (recommended)
2. **Run the test script**: `npx ts-node src/services/scraper/test-scraper.ts`
3. **Integrate into your NestJS services**

---

## 1️⃣ Add Module to Your App (30 seconds)

```typescript
// src/app.module.ts
import { ScraperModule } from './services/scraper/scraper.module';

@Module({
  imports: [
    // ... your existing modules
    ScraperModule,  // 👈 Add this line
  ],
})
export class AppModule {}
```

## 2️⃣ Test the API (2 minutes)

### Start your server:
```bash
npm run start:dev
# or
bun run start:dev
```

### Try these endpoints:

### Check if URL is supported
```bash
GET http://localhost:3000/scraper/check?url=https://www.amazon.in/dp/B08N5WRWNW
```

### Scrape a product
```bash
GET http://localhost:3000/scraper/product?url=https://www.amazon.in/dp/B08N5WRWNW
```

### Get providers
```bash
GET http://localhost:3000/scraper/providers
```

## 3️⃣ Use in Your Code (2 minutes)

```typescript
import { Injectable } from '@nestjs/common';
import { ScraperService, ScrapedProductMapper } from './services/scraper';

@Injectable()
export class YourService {
  constructor(private readonly scraperService: ScraperService) {}

  async importFromAmazon(url: string, userId: number) {
    // 1. Scrape the product
    const scraped = await this.scraperService.scrapeProduct(url);
    
    // 2. Convert to your Product format
    const productDto = ScrapedProductMapper.toCreateProductDto(
      scraped,
      userId,
      {
        categoryId: 123,  // Your category
        status: 'INACTIVE',  // Review before activating
      }
    );
    
    // 3. Generate SKU
    const sku = ScrapedProductMapper.generateSKU(scraped);
    
    // 4. Save to database
    const product = await this.prisma.product.create({
      data: {
        ...productDto,
        skuNo: sku,
      },
    });
    
    return product;
  }
}
```

## 4️⃣ That's It! 🎉

You can now:
- ✅ Scrape Amazon.in products
- ✅ Extract product details, images, prices
- ✅ Create products in your database
- ✅ Support dropshipping with markups

## 📚 Learn More

- **Full Documentation**: See `README.md`
- **Examples**: See `examples.ts` for 8 use cases
- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`

## 🆘 Common Issues

### Issue: "No suitable scraper provider found"
**Fix**: Make sure you're using a supported URL (Amazon.in)

### Issue: Timeout errors
**Fix**: Increase timeout in provider or check internet connection

### Issue: Empty data
**Fix**: Amazon may have changed their HTML structure. Check selectors in provider.

## 🚀 Next Steps

1. Try scraping a real Amazon.in product
2. Review the scraped data structure
3. Integrate with your product creation flow
4. Set products to INACTIVE for manual review
5. Test dropshipping with markup

---

**Questions?** Check the README.md for detailed documentation!
