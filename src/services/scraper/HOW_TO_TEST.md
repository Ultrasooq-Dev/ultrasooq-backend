# 🎯 HOW TO TEST THE SCRAPER SERVICE

## ⚠️ Important

**DO NOT run `examples.ts` directly!** It's a reference file with example code snippets.

---

## ✅ Method 1: REST API (Recommended)

### Step 1: Add ScraperModule to your app

```typescript
// src/app.module.ts
import { ScraperModule } from './services/scraper/scraper.module';

@Module({
  imports: [
    // ... other modules
    ScraperModule,
  ],
})
export class AppModule {}
```

### Step 2: Start your server

```bash
npm run start:dev
```

### Step 3: Test with HTTP requests

Use the `test-requests.http` file with REST Client extension, or use curl:

```bash
# Check providers
curl http://localhost:3000/scraper/providers

# Scrape a product
curl "http://localhost:3000/scraper/product?url=https://www.amazon.in/dp/B0CX59SMJ9"

# Check if URL is supported
curl "http://localhost:3000/scraper/check?url=https://www.amazon.in/dp/B0CX59SMJ9"
```

---

## ✅ Method 2: Standalone Test Script

Run the test script (requires your server to NOT be running):

```bash
npx ts-node src/services/scraper/test-scraper.ts
```

This will:
- Initialize the scraper service
- Scrape a sample Amazon.in product
- Display the results in console

---

## ✅ Method 3: Use in Your Service

```typescript
import { Injectable } from '@nestjs/common';
import { ScraperService, ScrapedProductMapper } from './services/scraper';

@Injectable()
export class ProductService {
  constructor(private readonly scraperService: ScraperService) {}

  async importFromAmazon(url: string, userId: number) {
    // Scrape
    const scraped = await this.scraperService.scrapeProduct(url);
    
    // Convert to DTO
    const dto = ScrapedProductMapper.toCreateProductDto(scraped, userId);
    
    // Save to database
    // ... your code here
  }
}
```

---

## 📁 File Guide

| File | Purpose | Can Run? |
|------|---------|----------|
| `test-requests.http` | HTTP test requests | ✅ Yes (with REST Client) |
| `test-scraper.ts` | Standalone test | ✅ Yes (with ts-node) |
| `examples.ts` | Code examples | ❌ Reference only |
| `README.md` | Documentation | 📖 Read |
| `QUICK_START.md` | Quick guide | 📖 Read |

---

## 🔧 Troubleshooting

### "export not found" error when running examples.ts
**Solution**: Don't run `examples.ts`! Use the REST API or `test-scraper.ts` instead.

### Cannot find module errors
**Solution**: Make sure you've added `ScraperModule` to `app.module.ts`

### Timeout errors
**Solution**: Increase timeout or check internet connection

### No data scraped
**Solution**: Amazon might have changed their HTML structure. Update selectors in provider.

---

## ✨ Quick Test

1. Start server: `npm run start:dev`
2. Open browser: `http://localhost:3000/scraper/product?url=https://www.amazon.in/dp/B0CX59SMJ9`
3. See JSON response with scraped product data!

---

## 📚 Next Steps

1. ✅ Test with the API
2. 📖 Read `README.md` for full documentation
3. 👀 Check `examples.ts` for integration patterns
4. 🔨 Integrate into your product service
5. 🚀 Start scraping!
