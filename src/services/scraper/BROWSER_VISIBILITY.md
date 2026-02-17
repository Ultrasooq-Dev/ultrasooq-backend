# Browser Visibility Configuration

## Show/Hide Browser Window

You can control whether the browser window is visible during scraping by changing the `headless` setting.

### Location
File: `src/services/scraper/providers/amazon.in.scraper.provider.ts`

### Show Browser Window (for debugging)
```typescript
this.browser = await puppeteer.launch({
    headless: false, // ← Set to false to see browser
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // ... other args
    ],
});
```

### Hide Browser Window (for production)
```typescript
this.browser = await puppeteer.launch({
    headless: true, // ← Set to true to hide browser
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // ... other args
    ],
});
```

## When to Show Browser?

**Show (headless: false)** when:
- 🐛 Debugging scraping issues
- 👀 Verifying selectors work correctly
- 🧪 Testing on new websites
- 📸 Taking screenshots for documentation

**Hide (headless: true)** when:
- 🚀 Running in production
- ⚡ Better performance needed
- 🤖 Automated/scheduled scraping
- 📊 Running multiple scrapers in parallel

## Current Setting

Currently set to: **`headless: false`** (Browser window is visible)

This is good for debugging! Change to `true` for production use.

## Alternative: Environment Variable

For better flexibility, you can use an environment variable:

```typescript
this.browser = await puppeteer.launch({
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    // ...
});
```

Then in your `.env`:
```bash
# Show browser for debugging
SCRAPER_HEADLESS=false

# Hide browser for production
SCRAPER_HEADLESS=true
```
