# Amazon Scraper Improvements

## Issue
The Amazon.in scraper was timing out with the error:
```
TimeoutError: Waiting for selector `[data-component-type="s-search-result"]` failed
```

## Root Cause
Amazon frequently changes their HTML structure, and relying on a single CSS selector makes the scraper fragile. Additionally, the page load strategy (`networkidle2`) was too strict and caused timeouts.

## Solution

### 1. Multiple Selector Fallbacks
Instead of relying on a single selector, the scraper now tries multiple selectors in order:

```typescript
const selectors = [
    '[data-component-type="s-search-result"]',
    '.s-result-item[data-asin]',
    'div[data-component-type="s-search-result"]',
    '.s-search-results .s-result-item',
    '[cel_widget_id*="MAIN-SEARCH_RESULTS"]',
];
```

### 2. Improved Page Load Strategy
Changed from `networkidle2` to `domcontentloaded` for faster, more reliable loading:

```typescript
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
```

### 3. Graceful Degradation
The scraper now continues even if no selectors are found initially, attempting to extract data anyway:

```typescript
if (!selectorFound) {
    this.logger.warn('No search result selectors found, attempting to scrape anyway');
    // Continue anyway - we'll try to extract what we can
}
```

### 4. Enhanced Product Extraction
Added multiple fallback selectors for each data point:

- **Product Name**: 5 different selectors
- **Product URL**: 4 different selectors
- **Images**: 3 different selectors
- **Price**: Multiple price element selectors
- **Rating & Reviews**: Multiple selectors

### 5. Better Error Handling
Each selector attempt is wrapped in try-catch with logging:

```typescript
for (const selector of selectors) {
    try {
        await page.waitForSelector(selector, { timeout: 5000 });
        this.logger.log(`Found search results using selector: ${selector}`);
        selectorFound = true;
        break;
    } catch (error) {
        this.logger.warn(`Selector not found: ${selector}`);
    }
}
```

## Benefits

1. **More Resilient**: Works even when Amazon changes their HTML structure
2. **Better Performance**: Faster page load with `domcontentloaded`
3. **Better Logging**: Clear visibility into which selectors work
4. **Graceful Failures**: Attempts to extract data even with partial selector matches
5. **Higher Success Rate**: Multiple fallback options increase scraping success

## Testing

To test the improved scraper:

```bash
curl -X POST http://localhost:3000/scraper/list \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.amazon.in/s?k=ddr4+32gb"
  }'
```

## Future Improvements

1. Add retry logic with exponential backoff
2. Implement captcha detection and handling
3. Add proxy rotation support
4. Cache successful selectors for faster subsequent requests
5. Add user-agent rotation
