import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { MulterFile } from './types';
import { getErrorMessage } from 'src/common/utils/get-error-message';

@Injectable()
export class OpenRouterService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model: string;
  private readonly models: string[];
  private readonly visionModel: string;

  constructor() {
    // Get API key from environment variables
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    // Support multiple models (comma-separated) or single model
    // Default: Qwen + DeepSeek for parallel processing
    const modelsEnv = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct,deepseek/deepseek-chat-v3';
    this.models = modelsEnv.split(',').map(m => m.trim()).filter(m => m.length > 0);
    this.model = this.models[0]; // Default to first model for single calls (backward compatibility)
    
    // Vision model for image input (must support image_url messages)
    // You can override this via OPENROUTER_VISION_MODEL env var.
    // Recommended defaults: 'openai/gpt-4.1-mini' or 'openai/gpt-4o-mini'
    this.visionModel = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4.1-mini';
    
    if (!this.apiKey) {
    }
    
  }

  /**
   * Search for real product data using OpenRouter AI
   * Uses advanced prompting to get accurate, current product information
   * Returns multiple product suggestions with source URLs
   */
  async generateFromText(query: string): Promise<any> {
    try {
      // Check if API key is configured
      if (!this.apiKey) {
        throw new Error('OpenRouter API key is not configured. Please set OPENROUTER_API_KEY in your environment variables.');
      }


      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert product research assistant with knowledge of current products available on e-commerce websites. Search for products matching user queries and return detailed product information.

CRITICAL URL REQUIREMENTS:
- DO NOT generate fake product IDs or URLs that don't exist
- Use SEARCH URLs instead of product detail page URLs
- Format: Use e-commerce search URLs with the product name as query parameter
- Example URLs:
  * Amazon: https://www.amazon.com/s?k=PRODUCT_NAME
  * eBay: https://www.ebay.com/sch/i.html?_nkw=PRODUCT_NAME
  * Walmart: https://www.walmart.com/search?q=PRODUCT_NAME
  * AliExpress: https://www.aliexpress.com/wholesale?SearchText=PRODUCT_NAME
- This ensures vendors can find the actual products even if exact product pages aren't available

INSTRUCTIONS:
1. Search for products matching the query on major e-commerce sites (Amazon, eBay, Walmart, AliExpress, etc.)
2. Return 3-5 product objects - can be variations of the same product (different storage, colors, sellers) or different models
3. For each product, provide detailed, realistic product information based on actual product specifications
4. Use current market pricing and specifications
5. If exact product doesn't exist, return the closest available alternatives

RETURN FORMAT:
Return a JSON array of 3-5 product objects. Each product MUST have:
- productName: string (required) - exact product name (e.g., "iPhone 17 Pro 256GB" or "iPhone 17 Pro Max 512GB")
- description: string (required) - detailed product description (200-500 words) with real specifications and features
- estimatedPrice: number (optional) - realistic price in USD based on market data
- category: string (optional) - product category (e.g., "Smartphones", "Electronics")
- brand: string (optional) - brand name (e.g., "Apple", "Samsung")
- specifications: array of {label: string, specification: string} (optional) - key technical specs
- shortDescription: string (optional) - brief 1-2 sentence description
- sourceUrl: string (required) - SEARCH URL format (e.g., https://www.amazon.com/s?k=iPhone+17+Pro or https://www.ebay.com/sch/i.html?_nkw=iPhone+17+Pro)
- sourceName: string (required) - source name (e.g., "Amazon", "eBay", "Walmart", "AliExpress")

IMPORTANT: 
- ALWAYS return a JSON array with products - never return an empty array
- Use SEARCH URLs, not product detail page URLs
- Provide multiple variations of the same product when possible (different models, configurations)
- Generate realistic, accurate product data based on real product information`,
            },
            {
              role: 'user',
              content: `Search for products matching: "${query}". Return 3-5 product suggestions - you can return multiple variations of the same product (different storage sizes, colors, models). For each product, provide detailed information including name, description, price, specifications, and a SEARCH URL (not a product page URL). Return ONLY a valid JSON array with products.`,
            },
          ],
          temperature: 0.3, // Lower temperature for more accurate, deterministic results
          max_tokens: 4000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://ultrasooq.com',
            'X-Title': 'UltraSooq',
            'Content-Type': 'application/json',
          },
        }
      );

      // Check if response has expected structure
      if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
        throw new Error('Invalid response structure from OpenRouter API');
      }

      const content = response.data.choices[0].message.content;
      
      if (!content) {
        throw new Error('Empty content in OpenRouter API response');
      }

      
      // Parse JSON from response
      let productData;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        productData = JSON.parse(jsonString);
        
        // Ensure it's an array
        if (!Array.isArray(productData)) {
          // If single object, wrap in array
          if (typeof productData === 'object' && productData !== null) {
            productData = [productData];
          } else {
            throw new Error('Response is not an array or object');
          }
        }
        
      } catch (parseError: any) {
        
        // If direct parse fails, try to extract JSON array
        const jsonArrayMatch = content.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          try {
            productData = JSON.parse(jsonArrayMatch[0]);
          } catch (e) {
          }
        }
        
        if (!productData) {
          // Try single object
          const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            try {
              productData = [JSON.parse(jsonObjectMatch[0])];
            } catch (e) {
            }
          }
        }
        
        if (!productData) {
          throw new Error(`Could not parse AI response as JSON. Error: ${parseError.message}`);
        }
      }
      
      // Validate productData exists and is an array
      if (!productData || !Array.isArray(productData)) {
        throw new Error('Invalid response format from AI');
      }

      // If empty array, the AI couldn't find products - this shouldn't happen with the new prompt
      if (productData.length === 0) {
        // Return empty array - frontend will handle showing "no results"
        return {
          success: true,
          data: [],
        };
      }

      // Validate and ensure each product has sourceUrl and sourceName
      // Convert to search URLs if they look like fake product page URLs
      const validatedProducts = productData.map((product: any, index: number) => {
        let sourceUrl = product.sourceUrl || product.url;
        let sourceName = product.sourceName || product.source || 'Unknown Source';
        
        const productName = product.productName || query;
        
        // Check if URL is a placeholder, fake product ID, or invalid product page URL
        // Convert to search URL format instead
        if (!sourceUrl || 
            sourceUrl.includes('example.com') || 
            sourceUrl.match(/\/dp\/B[A-Z0-9]{8,}/) && !sourceUrl.includes('amazon.com/s?') ||
            sourceUrl.match(/\/itm\/\d+/) && !sourceUrl.includes('ebay.com/sch/')) {
          
          sourceName = sourceName || 'Amazon'; // Default to Amazon
          
          // Generate search URLs instead of product page URLs
          const searchUrlPatterns: { [key: string]: (name: string) => string } = {
            'Amazon': (name) => `https://www.amazon.com/s?k=${encodeURIComponent(name)}`,
            'eBay': (name) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}`,
            'Walmart': (name) => `https://www.walmart.com/search?q=${encodeURIComponent(name)}`,
            'AliExpress': (name) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(name)}`,
            'Target': (name) => `https://www.target.com/s?searchTerm=${encodeURIComponent(name)}`,
            'Best Buy': (name) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(name)}`,
          };
          
          const pattern = searchUrlPatterns[sourceName] || searchUrlPatterns['Amazon'];
          sourceUrl = pattern(productName);
        }
        
        // Extract source name from URL if not provided
        if (sourceName === 'Unknown Source' && sourceUrl) {
          try {
            const url = new URL(sourceUrl);
            const hostname = url.hostname.replace('www.', '').split('.')[0];
            sourceName = hostname.charAt(0).toUpperCase() + hostname.slice(1);
          } catch {
            // Keep Unknown Source
          }
        }
        
        return {
          ...product,
          sourceUrl,
          sourceName,
          // Ensure image field is present
          image: product.image || product.thumbnail || '',
        };
      });

      return {
        success: true,
        data: validatedProducts, // Return array of products
      };
    } catch (error: any) {
      
      // If it's an error we threw ourselves (parsing, etc.), return it
      if (error.message && !error.response) {
        return {
          success: false,
          message: getErrorMessage(error) || 'Failed to parse AI response',
        };
      }
      
      return {
        success: false,
        message: error.response?.data?.error?.message || error.message || 'Failed to search for product data',
      };
    }
  }

  /**
   * Generate product data from image using vision model
   */
  async generateFromImage(imageFile: MulterFile): Promise<any> {
    try {
      // Convert image to base64
      const imageBase64 = imageFile.buffer.toString('base64');
      const imageMimeType = imageFile.mimetype;

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.visionModel, // Vision-capable model
          messages: [
            {
              role: 'system',
              content: `You are an expert product research assistant. Analyze product images and search for similar/related products on e-commerce websites. Return multiple product suggestions with detailed information.

CRITICAL URL REQUIREMENTS:
- DO NOT generate fake product IDs or URLs that don't exist
- Use SEARCH URLs instead of product detail page URLs
- Format: Use e-commerce search URLs with the product name as query parameter
- Example URLs:
  * Amazon: https://www.amazon.com/s?k=PRODUCT_NAME
  * eBay: https://www.ebay.com/sch/i.html?_nkw=PRODUCT_NAME
  * Walmart: https://www.walmart.com/search?q=PRODUCT_NAME
  * AliExpress: https://www.aliexpress.com/wholesale?SearchText=PRODUCT_NAME

INSTRUCTIONS:
1. Analyze the product image and identify the product (name, brand, model, key features)
2. Search for this product and similar/related products on major e-commerce sites (Amazon, eBay, Walmart, AliExpress, etc.)
3. Return 3-5 product objects - can be variations of the same product (different storage, colors, sellers) or different models
4. For each product, provide detailed, realistic product information based on actual product specifications
5. Use current market pricing and specifications

RETURN FORMAT:
Return a JSON array of 3-5 product objects. Each product MUST have:
- productName: string (required) - exact product name
- description: string (required) - detailed product description (200-500 words) with real specifications and features
- estimatedPrice: number (optional) - realistic price in USD based on market data
- category: string (optional) - product category (e.g., "Smartphones", "Electronics")
- brand: string (optional) - brand name
- specifications: array of {label: string, specification: string} (optional) - key technical specs
- shortDescription: string (optional) - brief 1-2 sentence description
- sourceUrl: string (required) - SEARCH URL format (e.g., https://www.amazon.com/s?k=PRODUCT_NAME)
- sourceName: string (required) - source name (e.g., "Amazon", "eBay", "Walmart", "AliExpress")
- image: string (optional) - product image URL if available

IMPORTANT: 
- ALWAYS return a JSON array with 3-5 products - never return an empty array or single object
- Use SEARCH URLs, not product detail page URLs
- Provide multiple variations of the same product when possible (different models, configurations)
- Generate realistic, accurate product data based on what you see in the image and real product information`,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this product image and search for this product and similar/related products on e-commerce websites. Return 3-5 product suggestions - you can return multiple variations of the same product (different storage sizes, colors, models). For each product, provide detailed information including name, description, price, specifications, and a SEARCH URL (not a product page URL). Return ONLY a valid JSON array with 3-5 products.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${imageMimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.3, // Lower temperature for more accurate results
          max_tokens: 4000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://ultrasooq.com',
            'X-Title': 'UltraSooq',
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      
      
      // Parse JSON from response - same logic as generateFromText to return array
      let productData;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        productData = JSON.parse(jsonString);
        
        // Ensure it's an array (like generateFromText)
        if (!Array.isArray(productData)) {
          // If single object, wrap in array
          if (typeof productData === 'object' && productData !== null) {
            productData = [productData];
          } else {
            throw new Error('Response is not an array or object');
          }
        }
        
      } catch (parseError: any) {
        
        // If direct parse fails, try to extract JSON array
        const jsonArrayMatch = content.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          try {
            productData = JSON.parse(jsonArrayMatch[0]);
          } catch (e) {
          }
        }
        
        if (!productData) {
          // Try single object
          const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            try {
              productData = [JSON.parse(jsonObjectMatch[0])];
            } catch (e) {
            }
          }
        }
        
        if (!productData) {
          throw new Error(`Could not parse AI response as JSON. Error: ${parseError.message}`);
        }
      }
      
      // Validate productData exists and is an array
      if (!productData || !Array.isArray(productData)) {
        throw new Error('Invalid response format from AI');
      }

      // If empty array, return empty array - frontend will handle showing "no results"
      if (productData.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      // Validate and ensure each product has sourceUrl and sourceName (same as generateFromText)
      const validatedProducts = productData.map((product: any) => {
        let sourceUrl = product.sourceUrl || product.url;
        let sourceName = product.sourceName || product.source || 'Unknown Source';
        
        const productName = product.productName || 'Product';
        
        // Check if URL is a placeholder, fake product ID, or invalid product page URL
        // Convert to search URL format instead
        if (!sourceUrl || 
            sourceUrl.includes('example.com') || 
            (sourceUrl.match(/\/dp\/B[A-Z0-9]{8,}/) && !sourceUrl.includes('amazon.com/s?')) ||
            (sourceUrl.match(/\/itm\/\d+/) && !sourceUrl.includes('ebay.com/sch/'))) {
          
          sourceName = sourceName || 'Amazon'; // Default to Amazon
          
          // Generate search URLs instead of product page URLs
          const searchUrlPatterns: { [key: string]: (name: string) => string } = {
            'Amazon': (name) => `https://www.amazon.com/s?k=${encodeURIComponent(name)}`,
            'eBay': (name) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}`,
            'Walmart': (name) => `https://www.walmart.com/search?q=${encodeURIComponent(name)}`,
            'AliExpress': (name) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(name)}`,
            'Target': (name) => `https://www.target.com/s?searchTerm=${encodeURIComponent(name)}`,
            'Best Buy': (name) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(name)}`,
          };
          
          const pattern = searchUrlPatterns[sourceName] || searchUrlPatterns['Amazon'];
          sourceUrl = pattern(productName);
        }
        
        // Extract source name from URL if not provided
        if (sourceName === 'Unknown Source' && sourceUrl) {
          try {
            const url = new URL(sourceUrl);
            const hostname = url.hostname.replace('www.', '').split('.')[0];
            sourceName = hostname.charAt(0).toUpperCase() + hostname.slice(1);
          } catch {
            // Keep Unknown Source
          }
        }
        
        return {
          ...product,
          sourceUrl,
          sourceName,
          // Ensure image field is present
          image: product.image || product.thumbnail || '',
        };
      });

      return {
        success: true,
        data: validatedProducts, // Return array of products (same as generateFromText)
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error?.message || error.message || 'Failed to analyze image',
      };
    }
  }

  /**
   * Generate product data from URL
   * Note: For better results, you might want to scrape the URL first and send the content
   */
  async generateFromUrl(url: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a product data extraction assistant. Based on a product URL, generate structured product information in JSON format.
              Return a JSON object with the following fields:
              - productName: string (required)
              - description: string (required)
              - estimatedPrice: number (optional)
              - category: string (optional)
              - brand: string (optional)
              - specifications: array of {label: string, specification: string} (optional)
              - shortDescription: string (optional)
              
              Be accurate and realistic with the data. If you cannot determine certain fields, omit them. Only return valid JSON, no markdown formatting.`,
            },
            {
              role: 'user',
              content: `Extract product information from this URL: ${url}. Generate product data in JSON format only, no markdown formatting.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://ultrasooq.com',
            'X-Title': 'UltraSooq',
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      
      // Parse JSON from response
      let productData;
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        productData = JSON.parse(jsonString);
      } catch (parseError) {
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          productData = JSON.parse(jsonObjectMatch[0]);
        } else {
          throw new Error('Could not parse AI response as JSON');
        }
      }

      return {
        success: true,
        data: productData,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error?.message || error.message || 'Failed to extract product data from URL',
      };
    }
  }

  /**
   * Match AI-generated category with existing platform categories using AI
   * Uses semantic understanding to find the best matching category
   * Prioritizes leaf categories over parent categories
   */
  async matchCategory(
    aiCategoryName: string, 
    availableCategories: Array<{ id: number; name: string; isLeaf?: boolean }>,
    productName?: string
  ): Promise<{ matchedCategoryId: number | null; confidence: string }> {
    if (!this.apiKey) {
      return {
        matchedCategoryId: null,
        confidence: 'low',
      };
    }

    if (!aiCategoryName || !availableCategories || availableCategories.length === 0) {
      return {
        matchedCategoryId: null,
        confidence: 'low',
      };
    }

    try {
      
      // Separate leaf and parent categories
      const allLeafCategories = availableCategories.filter(cat => cat.isLeaf === true);
      const parentCategories = availableCategories.filter(cat => cat.isLeaf !== true);
      
      // Apply simple keyword-based filtering on leaves using productName/aiCategoryName
      let leafCategories = allLeafCategories;
      const text = (productName || aiCategoryName || '').toLowerCase();

      if (leafCategories.length > 0) {
        // Laptop / PC categories
        if (/(laptop|notebook|ultrabook|macbook|gaming laptop|computer|pc|desktop)/.test(text)) {
          const filtered = allLeafCategories.filter(cat =>
            /laptop|notebook|computer|pc|desktop/i.test(cat.name)
          );
          if (filtered.length) {
            leafCategories = filtered;
          }
        }
        // Smartphone / phone categories
        else if (/(smartphone|iphone|android phone|mobile phone|cell phone|galaxy s|pixel)/.test(text)) {
          const filtered = allLeafCategories.filter(cat =>
            /smartphone|mobile phone|phone/i.test(cat.name)
          );
          if (filtered.length) {
            leafCategories = filtered;
          }
        }
        // Headphones / headsets / earbuds
        else if (/(headphone|headphones|earphone|earphones|earbud|earbuds|headset|airpods|buds)/.test(text)) {
          const filtered = allLeafCategories.filter(cat =>
            /headphone|headphones|earphone|earphones|earbud|earbuds|headset|audio/i.test(cat.name)
          );
          if (filtered.length) {
            leafCategories = filtered;
          }
        }
        // Speakers / soundbars
        else if (/(speaker|speakers|soundbar|sound bar|bluetooth speaker|home theater)/.test(text)) {
          const filtered = allLeafCategories.filter(cat =>
            /speaker|soundbar|home theater|audio/i.test(cat.name)
          );
          if (filtered.length) {
            leafCategories = filtered;
          }
        }
        // You can extend this with more product families (TV, camera, etc.) as needed
      }
      

      // Format categories list for the prompt, prioritizing leaf categories
      const leafCategoriesList = leafCategories.length > 0 
        ? `LEAF CATEGORIES (PRIORITY - match these first if possible):\n${leafCategories.map(cat => `- ID: ${cat.id}, Name: "${cat.name}"`).join('\n')}\n\n`
        : '';
      
      const parentCategoriesList = parentCategories.length > 0
        ? `PARENT CATEGORIES (use only if no leaf category matches):\n${parentCategories.map(cat => `- ID: ${cat.id}, Name: "${cat.name}"`).join('\n')}`
        : '';
      
      const categoriesList = leafCategoriesList + parentCategoriesList;
      
      // Log categories for debugging

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a category matching expert. Your task is to find the BEST matching category from a list of available categories for a given category name.

CRITICAL RULES - FOLLOW STRICTLY:
1. NEVER match with a PARENT category if LEAF categories are available - even if the parent category name matches exactly
2. ALWAYS prefer LEAF categories - they are more specific and accurate
3. If the category name is "Electronics" and leaf categories like "Smartphone", "Laptops" exist, match with one of those leaf categories instead
4. Only use parent categories if ABSOLUTELY NO leaf category matches (very rare)
5. Use semantic understanding: "Smartphones" matches "Mobile Phones", "iPhone" matches "Smartphone"
6. Look for synonyms, related terms, broader categories within leaf categories
7. If the exact category doesn't exist, find the closest related LEAF category
8. ONLY return null if absolutely no related category exists (very rare)

MATCHING STRATEGY (STRICT ORDER):
1. FIRST: Try to match with LEAF CATEGORIES ONLY (these are the most specific)
   - If "Electronics" is the category name and "Smartphone" is a leaf category, match "Smartphone"
   - If "Electronics" is the category name and "Laptops" is a leaf category, match "Laptops"
2. SECOND: Only if NO leaf category matches at all, then try parent categories
3. Exact match or very similar → "high" confidence
4. Related category (synonym, broader term) → "medium" confidence  
5. Somewhat related category → "low" confidence

EXAMPLES:
- Category name: "Electronics" with leaf categories ["Smartphone", "Laptops"] → Match "Smartphone" or "Laptops" (NOT "Electronics")
- Category name: "Smartphones" with leaf categories ["Mobile Phones", "Smartphone"] → Match "Smartphone" or "Mobile Phones"
- Category name: "Laptops" with leaf categories ["Laptops", "Gaming Laptops"] → Match "Laptops"
- Category name: "T-Shirts" with leaf categories ["T-Shirts", "Casual Wear"] → Match "T-Shirts"

RETURN FORMAT (JSON only):
{
  "matchedCategoryId": <number or null>,
  "confidence": "high" | "medium" | "low"
}

CRITICAL: If leaf categories are provided, you MUST match with a leaf category. Matching with a parent category when leaf categories exist is WRONG.`,
            },
            {
              role: 'user',
              content: `AI-Generated Category Name: "${aiCategoryName}"
${productName ? `Product Name: "${productName}"` : ''}

Available Categories:
${categoriesList}

Find the BEST matching category ID for "${aiCategoryName}". 

CRITICAL REQUIREMENTS:
- If LEAF CATEGORIES are listed above, you MUST match with one of them
- DO NOT match with a parent category if leaf categories are available
- Even if "${aiCategoryName}" exactly matches a parent category name, find a related leaf category instead
- Use the Product Name context to make better decisions:
  * If product name contains "laptop", "notebook", "computer", "PC", "desktop" → match with "Laptops" or similar computer categories
  * If product name contains "phone", "smartphone", "iPhone", "Android", "mobile" → match with "Smartphone" or similar mobile categories
  * If product name contains "tablet", "iPad" → match with "Tablets" or similar tablet categories
- Use semantic matching: if category is "Electronics" and leaf categories include "Smartphone" or "Laptops", use the product name to determine which one
- Only use parent categories if NO leaf category matches at all

Return ONLY a JSON object with matchedCategoryId and confidence.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 300,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://ultrasooq.com',
            'X-Title': 'UltraSooq',
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;

      // Parse JSON response
      let matchResult;
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        matchResult = JSON.parse(jsonString);
      } catch (parseError: any) {
        return {
          matchedCategoryId: null,
          confidence: 'low',
        };
      }

      // Validate the matched category ID exists in the available categories
      if (matchResult.matchedCategoryId) {
        const categoryExists = availableCategories.some(
          cat => cat.id === matchResult.matchedCategoryId
        );
        if (!categoryExists) {
          return {
            matchedCategoryId: null,
            confidence: 'low',
          };
        }
        
        // Verify we're prioritizing leaf categories
        const matchedCategory = availableCategories.find(cat => cat.id === matchResult.matchedCategoryId);
        if (matchedCategory && !matchedCategory.isLeaf && leafCategories.length > 0) {
          // If we matched a parent but leaf categories exist, try to find a better match
          // This is a fallback - ideally the AI should have matched a leaf category
          
          // Try to find any leaf category that might match semantically
          // This is a last resort - we'll return the parent but log the issue
        }
      }

      return {
        matchedCategoryId: matchResult.matchedCategoryId || null,
        confidence: matchResult.confidence || 'low',
      };
    } catch (error: any) {
      return {
        matchedCategoryId: null,
        confidence: 'low',
      };
    }
  }

  /**
   * Remove duplicate products based on productName and sourceUrl
   */
  private removeDuplicates(products: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const product of products) {
      const key = `${product.productName?.toLowerCase()}_${product.sourceUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(product);
      }
    }

    return unique;
  }

  /**
   * Generate product models/variants list with brief specifications
   * Returns model names with key specifications (less than 100 words)
   */
  async generateProductList(query: string): Promise<any> {
    try {
      if (!this.apiKey) {
        throw new Error('OpenRouter API key is not configured');
      }


      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert product research assistant. When a user searches for a product, return the different models/variants of that product with brief specifications.

INSTRUCTIONS:
1. Analyze the search query and identify the product family (e.g., "iPhone 15", "Samsung Galaxy S24", "MacBook Pro")
2. Return the different models/variants available for that product family
3. For each model, include brief key specifications (MUST be less than 100 words total - be concise!)
4. Include all major variants/models (e.g., base model, Plus, Pro, Pro Max, different storage sizes, etc.)

SPECIFICATIONS FORMAT:
For each model, include ONLY the most important key specs in "Label: Value" format. Each line must follow this exact format:
- Device Type: [value]
- Display: [value]
- Processor: [value]
- Cameras: [value]
- Storage Options: [value]
- Operating System: [value]
- Charging Port: [value] (or other key features)

CRITICAL REQUIREMENTS:
1. Each specification line MUST be in "Label: Value" format (e.g., "Device Type: Smartphone")
2. Keep total specifications under 100 words
3. Use descriptive labels (Device Type, Display, Processor, Cameras, Storage Options, Operating System, Charging Port)
4. One specification per line, separated by newlines (\n)
5. Focus on key differentiating features only

EXAMPLES:
- Query: "iPhone 15" → [
    {
      "modelName": "Apple iPhone 15",
      "specifications": "Device Type: Smartphone\nDisplay: 6.1\" Super Retina XDR OLED\nProcessor: A16 Bionic\nCameras: 48 MP + 12 MP\nStorage Options: 128/256/512 GB\nOperating System: iOS 17\nCharging Port: USB-C"
    },
    {
      "modelName": "Apple iPhone 15 Plus",
      "specifications": "Device Type: Smartphone\nDisplay: 6.7\" Super Retina XDR OLED\nProcessor: A16 Bionic\nCameras: 48 MP + 12 MP\nStorage Options: 128/256/512 GB\nOperating System: iOS 17\nCharging Port: USB-C"
    },
    {
      "modelName": "Apple iPhone 15 Pro",
      "specifications": "Device Type: Smartphone\nDisplay: 6.1\" Super Retina XDR OLED 120 Hz\nProcessor: A17 Pro\nCameras: 48 MP + 12 MP + 12 MP\nStorage Options: 128/256/512 GB/1 TB\nOperating System: iOS 17\nCharging Port: USB-C"
    },
    {
      "modelName": "Apple iPhone 15 Pro Max",
      "specifications": "Device Type: Smartphone\nDisplay: 6.7\" Super Retina XDR OLED 120 Hz\nProcessor: A17 Pro\nCameras: 48 MP + 12 MP + 12 MP (5x optical)\nStorage Options: 256/512 GB/1 TB\nOperating System: iOS 17\nCharging Port: USB-C"
    }
  ]

RETURN FORMAT:
Return a JSON array of objects, each with:
- modelName: string (required) - Full model name
- specifications: string (required) - Brief key specifications in "Label: Value" format, one per line, separated by \\n (MUST be less than 100 words total)

CRITICAL JSON FORMATTING RULES:
1. The specifications field must be a valid JSON string - escape all newlines as \\n (double backslash + n)
2. Escape all quotes inside string values as \\"
3. Each specification line should be separated by \\n in the JSON string
4. Example: "specifications": "Device Type: Smartphone\\nDisplay: 6.1\\\" Super Retina XDR OLED\\nProcessor: A16 Bionic"
5. Return ONLY valid JSON - no markdown, no code blocks, just pure JSON array

IMPORTANT: Always use "Label: Value" format. Never use bullet points or dashes. Each line should be "Label: Value" format. Ensure all control characters are properly escaped in JSON.`,
            },
            {
              role: 'user',
              content: `Find all models/variants for: "${query}". Return a VALID JSON array with modelName and brief specifications. Remember to escape newlines as \\n and quotes as \\" in the JSON string. Specifications MUST be less than 100 words each - be very concise, only key specs.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://ultrasooq.com',
            'X-Title': 'UltraSooq',
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      
      // Helper function to clean JSON string and escape control characters properly
      const cleanJsonString = (str: string): string => {
        // Remove markdown code blocks if present
        let cleaned = str.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Try to find JSON array pattern
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          cleaned = arrayMatch[0];
        }
        
        // Fix common JSON issues: escape control characters in string values
        // This regex matches string values and properly escapes control characters
        let result = '';
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < cleaned.length; i++) {
          const char = cleaned[i];
          
          if (escapeNext) {
            result += char;
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            result += char;
            escapeNext = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            result += char;
            continue;
          }
          
          if (inString) {
            // Inside a string, escape control characters
            if (char === '\n') {
              result += '\\n';
            } else if (char === '\r') {
              result += '\\r';
            } else if (char === '\t') {
              result += '\\t';
            } else if (char === '\f') {
              result += '\\f';
            } else if (char === '\b') {
              result += '\\b';
            } else {
              result += char;
            }
          } else {
            result += char;
          }
        }
        
        return result;
      };
      
      // Parse JSON response
      let models: any[];
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
        let jsonString = jsonMatch ? jsonMatch[1] : content;
        
        // Clean the JSON string
        jsonString = cleanJsonString(jsonString);
        
        models = JSON.parse(jsonString);
        
        if (!Array.isArray(models)) {
          throw new Error('Response is not an array');
        }
        
        // Validate and normalize models, ensure specifications are under 100 words
        const validatedModels = models.map((m: any) => {
          // Handle both string and object formats for backward compatibility
          if (typeof m === 'string') {
            return {
              modelName: m,
              specifications: '',
            };
          } else if (typeof m === 'object' && m !== null) {
            let specs = m.specifications || m.specs || '';
            
            // Ensure specifications are under 100 words
            if (specs) {
              const wordCount = specs.split(/\s+/).length;
              if (wordCount > 100) {
                // Truncate to first 100 words
                const words = specs.split(/\s+/);
                specs = words.slice(0, 100).join(' ');
              }
            }
            
            return {
              modelName: m.modelName || m.name || '',
              specifications: specs,
            };
          }
          return null;
        }).filter((m: any) => m && m.modelName && m.modelName.trim().length > 0);
        
        return {
          success: true,
          data: validatedModels,
        };
      } catch (parseError: any) {
        // Try alternative parsing with better cleaning
        try {
          const jsonArrayMatch = content.match(/\[[\s\S]*\]/);
          if (jsonArrayMatch) {
            let cleanedJson = cleanJsonString(jsonArrayMatch[0]);
            models = JSON.parse(cleanedJson);
            if (!Array.isArray(models)) {
              throw new Error('Response is not an array');
            }
            
            // Validate and normalize models
            const validatedModels = models.map((m: any) => {
              if (typeof m === 'string') {
                return {
                  modelName: m,
                  specifications: '',
                };
              } else if (typeof m === 'object' && m !== null) {
                let specs = m.specifications || m.specs || '';
                
                // Ensure specifications are under 100 words
                if (specs) {
                  const wordCount = specs.split(/\s+/).length;
                  if (wordCount > 100) {
                    const words = specs.split(/\s+/);
                    specs = words.slice(0, 100).join(' ');
                  }
                }
                
                return {
                  modelName: m.modelName || m.name || '',
                  specifications: specs,
                };
              }
              return null;
            }).filter((m: any) => m && m.modelName && m.modelName.trim().length > 0);
            
            return {
              success: true,
              data: validatedModels,
            };
          } else {
            throw new Error('No JSON array found in response');
          }
        } catch (e) {
          // Last resort: try to manually extract and reconstruct JSON
          
          // Try to extract models manually using regex
          try {
            const modelNamePattern = /"modelName"\s*:\s*"([^"]+)"|"name"\s*:\s*"([^"]+)"/g;
            const specPattern = /"specifications"\s*:\s*"([^"]*(?:\\.[^"]*)*)"|"specs"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/g;
            
            // Extract all model names
            const names: string[] = [];
            let modelMatch;
            while ((modelMatch = modelNamePattern.exec(content)) !== null) {
              names.push(modelMatch[1] || modelMatch[2] || '');
            }
            
            // Extract all specifications
            const specs: string[] = [];
            let specMatch;
            while ((specMatch = specPattern.exec(content)) !== null) {
              const spec = (specMatch[1] || specMatch[2] || '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
              specs.push(spec);
            }
            
            // Match names with specs
            if (names.length > 0) {
              models = names.map((name, idx) => ({
                modelName: name,
                specifications: specs[idx] || '',
              }));
              
              // Validate and normalize models
              const validatedModels = models.map((m: any) => {
                let specStr = m.specifications || '';
                
                // Ensure specifications are under 100 words
                if (specStr) {
                  const wordCount = specStr.split(/\s+/).length;
                  if (wordCount > 100) {
                    const words = specStr.split(/\s+/);
                    specStr = words.slice(0, 100).join(' ');
                  }
                }
                
                return {
                  modelName: m.modelName || '',
                  specifications: specStr,
                };
              }).filter((m: any) => m && m.modelName && m.modelName.trim().length > 0);
              
              if (validatedModels.length > 0) {
                return {
                  success: true,
                  data: validatedModels,
                };
              }
            }
          } catch (manualError: any) {
          }
          
          throw new Error(`Could not parse AI response as JSON: ${parseError.message}`);
        }
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to generate product models',
      };
    }
  }

  /**
   * Generate full product details for a selected product
   * Called after user selects a product from the list
   */
  async generateProductDetails(
    productName: string, 
    category?: string, 
    brand?: string,
    availableCategories?: Array<{ id: number; name: string }>
  ): Promise<any> {
    try {
      if (!this.apiKey) {
        throw new Error('OpenRouter API key is not configured');
      }


      // Build category context for AI if available
      let categoryContext = '';
      if (availableCategories && availableCategories.length > 0) {
        const categoryList = availableCategories.map(cat => `${cat.id}: ${cat.name}`).join(', ');
        categoryContext = `\n\nAVAILABLE CATEGORIES IN SYSTEM:\n${categoryList}\n\nIMPORTANT: Try to match the product to one of these categories. Return the category ID that best matches.`;
      }

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert product research assistant specializing in global e-commerce, with deep knowledge of Chinese e-commerce platforms. Generate comprehensive product details for a specific product model.

CRITICAL: Prioritize information from Chinese e-commerce platforms (Taobao, JD.com, 1688.com, TMall, Pinduoduo) as they often have more detailed specifications and better pricing.

RETURN FORMAT:
Return a JSON object with the following fields:
- productName: string (required) - FULL descriptive product name (50-100 characters)
- description: string (required) - detailed product description (200-500 words)
- estimatedPrice: number (optional) - realistic price in USD
- category: string (required) - product category name that best matches the product
- matchedCategoryId: number (optional) - ID of the category from available categories that best matches (if provided)
- brand: string (optional) - brand name
- specifications: array of {label: string, specification: string} (required) - key technical specs
- shortDescription: string (optional) - brief 1-2 sentence description
- sourceUrl: string (required) - SEARCH URL format
- sourceName: string (required) - source name${categoryContext}`,
            },
            {
              role: 'user',
              content: `Generate full product details for: "${productName}"${category ? ` (Category: ${category})` : ''}${brand ? ` (Brand: ${brand})` : ''}. 

Return comprehensive information including description, specifications, price, and category matching. Return ONLY a valid JSON object.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://ultrasooq.com',
            'X-Title': 'UltraSooq',
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      
      // Parse JSON response
      let productDetails;
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        productDetails = JSON.parse(jsonString);
        
        if (Array.isArray(productDetails) && productDetails.length > 0) {
          productDetails = productDetails[0];
        }
      } catch (parseError: any) {
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          try {
            productDetails = JSON.parse(jsonObjectMatch[0]);
          } catch (e) {
            throw new Error(`Could not parse AI response as JSON: ${parseError.message}`);
          }
        } else {
          throw new Error(`Could not parse AI response as JSON: ${parseError.message}`);
        }
      }

      // Generate search URL if needed
      let sourceUrl = productDetails.sourceUrl;
      let sourceName = productDetails.sourceName || 'Taobao';
      
      if (!sourceUrl || sourceUrl.includes('example.com')) {
        const searchUrlPatterns: { [key: string]: (name: string) => string } = {
          'Amazon': (name) => `https://www.amazon.com/s?k=${encodeURIComponent(name)}`,
          'eBay': (name) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(name)}`,
          'Walmart': (name) => `https://www.walmart.com/search?q=${encodeURIComponent(name)}`,
          'AliExpress': (name) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(name)}`,
          'Taobao': (name) => `https://s.taobao.com/search?q=${encodeURIComponent(name)}`,
          'JD.com': (name) => `https://search.jd.com/Search?keyword=${encodeURIComponent(name)}`,
          '1688.com': (name) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(name)}`,
          'TMall': (name) => `https://list.tmall.com/search_product.htm?q=${encodeURIComponent(name)}`,
          'Pinduoduo': (name) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(name)}`,
        };
        
        const pattern = searchUrlPatterns[sourceName] || searchUrlPatterns['Taobao'];
        sourceUrl = pattern(productName);
      }

      const validatedDetails = {
        productName: productDetails.productName || productName,
        description: productDetails.description || '',
        estimatedPrice: productDetails.estimatedPrice || null,
        category: productDetails.category || category || '',
        matchedCategoryId: productDetails.matchedCategoryId || null,
        brand: productDetails.brand || brand || '',
        specifications: Array.isArray(productDetails.specifications) ? productDetails.specifications : [],
        shortDescription: productDetails.shortDescription || '',
        sourceUrl: sourceUrl,
        sourceName: sourceName,
        image: productDetails.image || '',
      };

      return {
        success: true,
        data: validatedDetails,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to generate product details',
      };
    }
  }

  // ══════════════════════════════════════════════
  // Phase 1: AI-Powered Category & Specification Helpers
  // ══════════════════════════════════════════════

  /**
   * Suggest categories for a product based on name, description, and tags.
   * Uses AI to analyze product text and match against known category structure.
   */
  async suggestCategories(
    productName: string,
    description: string,
    tags: string[],
    availableCategories: { id: number; name: string; parentName?: string }[],
  ): Promise<{ categoryId: number; categoryName: string; confidence: number; reason: string }[]> {
    try {
      if (!this.apiKey) throw new Error('OpenRouter API key not configured');

      const categoryList = availableCategories
        .map((c) => `ID:${c.id} - ${c.parentName ? c.parentName + ' > ' : ''}${c.name}`)
        .join('\n');

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a product categorization expert for an e-commerce marketplace.
Given a product's name, description, and tags, suggest the most relevant categories from the provided list.

Return a JSON array of category suggestions, each with:
- categoryId: number (from the provided list)
- categoryName: string
- confidence: number (0.0 to 1.0)
- reason: string (brief explanation)

Return 1-5 suggestions, ordered by confidence (highest first).
ONLY return categories from the provided list. Return ONLY valid JSON array.`,
            },
            {
              role: 'user',
              content: `Product: "${productName}"
Description: "${description || 'N/A'}"
Tags: ${tags.length > 0 ? tags.join(', ') : 'None'}

Available Categories:
${categoryList}

Suggest the most relevant categories for this product.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content || '[]';
      const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      return [];
    }
  }

  /**
   * Auto-generate spec values from product description using category templates.
   * AI analyzes the product text and extracts values for each spec template field.
   */
  async generateSpecValues(
    productName: string,
    description: string,
    templates: { id: number; name: string; key: string; dataType: string; unit?: string; options?: any }[],
  ): Promise<{ specTemplateId: number; value: string; numericValue?: number }[]> {
    try {
      if (!this.apiKey) throw new Error('OpenRouter API key not configured');

      const templateList = templates
        .map((t) => {
          let desc = `ID:${t.id} - "${t.name}" (${t.dataType})`;
          if (t.unit) desc += ` [unit: ${t.unit}]`;
          if (t.options && Array.isArray(t.options)) desc += ` [options: ${t.options.join(', ')}]`;
          return desc;
        })
        .join('\n');

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a product specification extraction expert.
Given a product name, description, and a list of specification template fields, extract the most accurate values from the product information.

Return a JSON array of spec values, each with:
- specTemplateId: number (from the provided template list)
- value: string (the extracted value as a string)
- numericValue: number (optional, only for NUMBER type specs - the parsed numeric value)

Rules:
- For SELECT/MULTI_SELECT types, only use values from the provided options
- For NUMBER types, extract the numeric value and include both value (string with unit) and numericValue (pure number)
- For BOOLEAN types, use "true" or "false"
- If you cannot determine a value confidently, skip that template
- Return ONLY valid JSON array`,
            },
            {
              role: 'user',
              content: `Product: "${productName}"
Description: "${description || 'N/A'}"

Specification Templates:
${templateList}

Extract specification values for this product.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content || '[]';
      const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      return [];
    }
  }

  /**
   * Extract keywords from product text for category matching.
   * Returns relevant keywords that can be matched against CategoryKeyword entries.
   */
  async extractKeywords(
    productName: string,
    description: string,
  ): Promise<string[]> {
    try {
      if (!this.apiKey) throw new Error('OpenRouter API key not configured');

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a keyword extraction expert for e-commerce product categorization.
Extract relevant keywords from the product name and description that would help categorize this product.

Return a JSON array of lowercase keyword strings (5-15 keywords).
Include: product type, brand, key features, material, use case, target audience.
Return ONLY valid JSON array of strings.`,
            },
            {
              role: 'user',
              content: `Product: "${productName}"
Description: "${description || 'N/A'}"

Extract categorization keywords.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content || '[]';
      const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      return [];
    }
  }

  /**
   * Advanced natural language product search.
   * Parses user search query into structured filters (category, specs, price range).
   */
  async parseSearchQuery(
    query: string,
    availableFilters: { key: string; name: string; dataType: string; options?: string[] }[],
  ): Promise<{
    searchTerm: string;
    categoryHint?: string;
    specFilters: Record<string, any>;
    priceRange?: { min?: number; max?: number };
    sortBy?: string;
  }> {
    try {
      if (!this.apiKey) throw new Error('OpenRouter API key not configured');

      const filterList = availableFilters
        .map((f) => {
          let desc = `"${f.key}" (${f.name}, ${f.dataType})`;
          if (f.options) desc += ` [options: ${f.options.slice(0, 10).join(', ')}]`;
          return desc;
        })
        .join('\n');

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are a search query parser for an e-commerce marketplace.
Parse the user's natural language search query into structured filters.

Return a JSON object with:
- searchTerm: string (cleaned search term for text search)
- categoryHint: string (optional, suggested category name)
- specFilters: object (key-value pairs matching available filter keys)
  - For NUMBER filters, use {min: number, max: number} or just a value
  - For SELECT filters, use the option value string
  - For BOOLEAN filters, use true/false
- priceRange: {min?: number, max?: number} (optional, if price mentioned)
- sortBy: string (optional: "price_asc", "price_desc", "rating", "newest")

Available Filters:
${filterList}

Return ONLY valid JSON object.`,
            },
            {
              role: 'user',
              content: query,
            },
          ],
          temperature: 0.2,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content || '{}';
      const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      return { searchTerm: query, specFilters: {} };
    }
  }
}
