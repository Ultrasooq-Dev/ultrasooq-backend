import { Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperProvider } from '../scraper.service';
import {
    ScrapedProduct,
    ScrapedSearchResult,
    ScrapedProductSummary,
} from '../interfaces/scraped-product.interface';
import { BrowserbaseHelper } from '../utils/browserbase.helper';

/**
 * Scraper provider for Taobao.com
 * Note: Taobao requires more complex handling due to anti-scraping measures
 * Now supports Browserbase for enhanced anti-detection capabilities
 */
export class TaobaoScraperProvider implements ScraperProvider {
    private readonly logger = new Logger(TaobaoScraperProvider.name);
    private browser: Browser | null = null;
    private browserbaseHelper: BrowserbaseHelper;
    private browserbaseSessionId: string | null = null;

    constructor() {
        this.browserbaseHelper = new BrowserbaseHelper();
    }

    /**
     * Check if this provider can scrape the given URL
     */
    canScrape(url: string): boolean {
        try {
            let candidate = url;
            if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
                candidate = 'http://' + candidate;
            }
            const hostname = new URL(candidate).hostname.toLowerCase();
            return hostname === 'taobao.com' || hostname.endsWith('.taobao.com');
        } catch (error) {
            this.logger.warn(`Error checking URL: ${error.message}`);
            return false;
        }
    }

    /**
     * Get or create browser instance
     * Uses Browserbase if enabled, otherwise falls back to local Puppeteer
     */
    private async getBrowser(): Promise<Browser> {
        // Check if Browserbase is enabled via environment variable
        const useBrowserbase = process.env.USE_BROWSERBASE === 'true' && this.browserbaseHelper.isEnabled();
        
        if (useBrowserbase) {
            // Use Browserbase
            if (!this.browser || !this.browser.connected) {
                this.logger.log('Creating Browserbase session for enhanced anti-detection');
                
                try {
                    const session = await this.browserbaseHelper.createSession({
                        stealth: true, // Enable stealth mode for Taobao
                    });
                    
                    this.browserbaseSessionId = session.id;
                    
                    // Validate browserWSEndpoint before connecting
                    if (!session.browserWSEndpoint) {
                        throw new Error('Browserbase session created but browserWSEndpoint is missing');
                    }
                    
                    this.logger.log(`Connecting to Browserbase endpoint: ${session.browserWSEndpoint}`);
                    
                    // Connect to Browserbase's WebSocket endpoint
                    // Only pass browserWSEndpoint to avoid the "Exactly one of..." error
                    this.browser = await puppeteer.connect({
                        browserWSEndpoint: session.browserWSEndpoint,
                    });
                    
                    this.logger.log(`✅ Connected to Browserbase session: ${session.id}`);
                } catch (error: any) {
                    this.logger.error(`Failed to create/connect Browserbase session: ${error.message}`);
                    
                    // Check for specific error types and provide helpful messages
                    if (error.message && (error.message.includes('429') || error.message.includes('concurrent sessions limit'))) {
                        this.logger.error('═══════════════════════════════════════════════════════');
                        this.logger.error('⚠️ BROWSERBASE SESSION LIMIT REACHED');
                        this.logger.error('═══════════════════════════════════════════════════════');
                        this.logger.error('Your Browserbase account shows limit: 0 concurrent sessions');
                        this.logger.error('');
                        this.logger.error('Possible causes:');
                        this.logger.error('1. Developer plan may not be fully activated');
                        this.logger.error('2. Account may need payment method verification');
                        this.logger.error('3. Session limit may need to be enabled by support');
                        this.logger.error('');
                        this.logger.error('Solutions:');
                        this.logger.error('- Check Browserbase dashboard: https://www.browserbase.com');
                        this.logger.error('- Verify Developer plan is active');
                        this.logger.error('- Contact Browserbase support: support@browserbase.com');
                        this.logger.error('- Check for any active sessions that need closing');
                        this.logger.error('');
                        this.logger.error('Falling back to local Puppeteer (no proxies/CAPTCHA solving)');
                        this.logger.error('═══════════════════════════════════════════════════════');
                    } else {
                        if (error.stack) {
                            this.logger.error(`Stack trace: ${error.stack}`);
                        }
                        this.logger.warn('Falling back to local Puppeteer');
                    }
                    
                    // Fallback to local browser
                    return this.getLocalBrowser();
                }
            }
            return this.browser;
        } else {
            // Use local Puppeteer (existing behavior)
            return this.getLocalBrowser();
        }
    }

    /**
     * Get local Puppeteer browser instance
     */
    private async getLocalBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.connected) {
            this.logger.log('Launching local browser instance');
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080',
                    '--disable-features=IsolateOrigins',
                    '--disable-site-isolation-trials',
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            });
        }
        return this.browser;
    }

    /**
     * Create a new page with common settings
     */
    private async createPage(): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        // Set user agent to avoid detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Set extra HTTP headers to mimic real browser
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Cache-Control': 'max-age=0',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
        });

        // Override navigator properties to avoid detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en'],
            });
        });

        return page;
    }

    /**
     * Check if user is logged in to Taobao
     */
    private async isLoggedIn(page: Page): Promise<boolean> {
        try {
            const cookies = await page.cookies();
            const hasLoginCookie = cookies.some(cookie => 
                cookie.name.includes('_tb_token_') || 
                cookie.name.includes('_m_h5_tk') ||
                cookie.name.includes('l') ||
                cookie.name.includes('_umid') ||
                cookie.name.includes('cookie2')
            );
            
            if (hasLoginCookie) {
                // Also check if page shows login prompt
                const hasLoginPrompt = await page.evaluate(() => {
                    const bodyText = document.body.innerText || '';
                    return bodyText.includes('请登录') || bodyText.includes('登录');
                });
                
                return !hasLoginPrompt;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Login to Taobao using QR code
     * User needs to scan QR code manually via Browserbase session recording
     */
    private async qrCodeLogin(page: Page): Promise<boolean> {
        try {
            this.logger.log('Starting QR code login process...');
            
            // Navigate to login page with longer timeout and better error handling
            this.logger.log('Navigating to Taobao login page...');
            try {
                await page.goto('https://login.taobao.com/member/login.jhtml', {
                    waitUntil: 'domcontentloaded', // Use domcontentloaded instead of networkidle2 for faster loading
                    timeout: 60000 // Increase timeout to 60 seconds
                });
                
                // Wait for page to fully load
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Verify we're on the login page
                const currentUrl = page.url();
                const pageTitle = await page.title();
                this.logger.log(`Login page loaded - URL: ${currentUrl.substring(0, 80)}, Title: ${pageTitle}`);
                
                // Check if page actually loaded content
                const pageContent = await page.evaluate(() => {
                    return {
                        bodyText: document.body.innerText.substring(0, 200),
                        hasContent: document.body.innerText.length > 50
                    };
                });
                
                if (!pageContent.hasContent) {
                    this.logger.warn('⚠️ Login page appears to be blank or not fully loaded');
                    this.logger.warn('Waiting additional time for page to load...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    this.logger.log(`Page content preview: ${pageContent.bodyText.substring(0, 100)}...`);
                }
            } catch (error: any) {
                if (error.message.includes('timeout')) {
                    this.logger.warn(`Login page navigation timed out, but continuing...`);
                    // Don't throw - continue anyway as page might have loaded
                } else {
                    this.logger.error(`Failed to load login page: ${error.message}`);
                    throw error;
                }
            }
            
            // Check if QR code is already displayed or if we need to click QR login tab
            const qrCodeVisible = await page.evaluate(() => {
                const qrCode = document.querySelector('.qr-login, .qr-code-container, #J_QRCodeImg, .login-qrcode');
                return qrCode && (qrCode as HTMLElement).offsetParent !== null;
            });
            
            if (!qrCodeVisible) {
                // Try to click QR code login tab
                try {
                    const qrTab = await page.$('.login-tab-qrcode, .qr-login-tab, [data-tab="qrcode"]');
                    if (qrTab) {
                        await qrTab.click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (e) {
                    this.logger.warn('Could not click QR code tab, QR code might already be visible');
                }
            }
            
            // Wait for QR code to appear - try multiple selectors
            let qrCodeFound = false;
            const qrCodeSelectors = [
                '.qr-login',
                '.qr-code-container',
                '#J_QRCodeImg',
                '.login-qrcode',
                'img[src*="qrcode"]',
                'img[src*="QR"]',
                '.qrcode',
                '[class*="qr"]',
                '[class*="QR"]',
                'canvas', // Some QR codes are rendered in canvas
            ];
            
            for (const selector of qrCodeSelectors) {
                try {
                    await page.waitForSelector(selector, {
                        timeout: 5000,
                        visible: true
                    });
                    this.logger.log(`✅ QR code found using selector: ${selector}`);
                    qrCodeFound = true;
                    break;
                } catch (e) {
                    // Try next selector
                }
            }
            
            if (!qrCodeFound) {
                // Check if QR code text is present (indicating QR login option)
                const hasQrText = await page.evaluate(() => {
                    const bodyText = document.body.innerText || '';
                    return bodyText.includes('扫码') || bodyText.includes('QR') || bodyText.includes('扫一扫');
                });
                
                if (hasQrText) {
                    this.logger.log('✅ QR code login option detected (text found)');
                    qrCodeFound = true;
                } else {
                    this.logger.warn('⚠️ QR code not found with any selector, but continuing...');
                    this.logger.warn('QR code might be loading or page structure changed');
                }
            }
            
            // Log instructions for user
            this.logger.warn('═══════════════════════════════════════════════════════');
            this.logger.warn('📱 QR CODE LOGIN REQUIRED');
            this.logger.warn('═══════════════════════════════════════════════════════');
            this.logger.warn('1. Open Browserbase dashboard and view the session recording');
            this.logger.warn('2. Find the QR code on the login page');
            this.logger.warn('3. Scan the QR code with your Taobao mobile app');
            this.logger.warn('4. Wait for login confirmation...');
            this.logger.warn('═══════════════════════════════════════════════════════');
            
            // Wait for login success - check for multiple indicators with better verification
            this.logger.log('Waiting for QR code to be scanned...');
            
            let loginSuccess = false;
            const maxWaitTime = 120000; // 2 minutes
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime && !loginSuccess) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
                
                try {
                    // Check current URL
                    const currentUrl = page.url();
                    const isOnLoginPage = currentUrl.includes('login');
                    
                    // Get cookies
                    const cookies = await page.cookies();
                    const loginCookies = cookies.filter(cookie => 
                        cookie.name.includes('_tb_token_') || 
                        cookie.name.includes('_m_h5_tk') ||
                        cookie.name.includes('_umid') ||
                        cookie.name.includes('cookie2') ||
                        cookie.name === 'l' ||
                        cookie.name === 'isg'
                    );
                    
                    // Check page content
                    const pageState = await page.evaluate(() => {
                        const bodyText = document.body.innerText || '';
                        const hasLoginPrompt = bodyText.includes('请登录') || bodyText.includes('登录');
                        const hasUserInfo = document.querySelector('.member-name, .user-info, .nickname, [class*="user"]') !== null;
                        const url = window.location.href;
                        
                        return {
                            hasLoginPrompt,
                            hasUserInfo,
                            url,
                            bodyTextLength: bodyText.length
                        };
                    });
                    
                    this.logger.log(`Login check: URL=${currentUrl.substring(0, 50)}, Cookies=${loginCookies.length}, LoginPrompt=${pageState.hasLoginPrompt}, UserInfo=${pageState.hasUserInfo}`);
                    
                    // Success conditions: either navigated away from login page OR has login cookies AND no login prompt
                    if (!isOnLoginPage && currentUrl.includes('taobao.com')) {
                        this.logger.log('✅ Navigated away from login page - login likely successful');
                        loginSuccess = true;
                        break;
                    }
                    
                    if (loginCookies.length >= 2 && !pageState.hasLoginPrompt) {
                        this.logger.log(`✅ Found ${loginCookies.length} login cookies and no login prompt - login successful`);
                        loginSuccess = true;
                        break;
                    }
                    
                    if (pageState.hasUserInfo && !pageState.hasLoginPrompt) {
                        this.logger.log('✅ Found user info on page - login successful');
                        loginSuccess = true;
                        break;
                    }
                } catch (e) {
                    this.logger.warn(`Error checking login status: ${e.message}`);
                }
            }
            
            if (loginSuccess) {
                // Final verification
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait a bit more for page to settle
                
                const cookies = await page.cookies();
                const loginCookies = cookies.filter(cookie => 
                    cookie.name.includes('_tb_token_') || 
                    cookie.name.includes('_m_h5_tk') ||
                    cookie.name.includes('_umid')
                );
                
                const finalCheck = await page.evaluate(() => {
                    const bodyText = document.body.innerText || '';
                    return !bodyText.includes('请登录');
                });
                
                if (loginCookies.length > 0 || finalCheck) {
                    this.logger.log(`✅ QR code login verified! Found ${loginCookies.length} login cookies`);
                    return true;
                } else {
                    this.logger.warn('⚠️ Login detected but verification failed');
                    return false;
                }
            }
            
            this.logger.warn('⚠️ QR code login timed out after 2 minutes');
            return false;
        } catch (error: any) {
            this.logger.error(`QR code login error: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if page shows CAPTCHA/verification challenge
     */
    private async hasVerificationChallenge(page: Page): Promise<boolean> {
        try {
            const hasChallenge = await page.evaluate(() => {
                const bodyText = document.body.innerText || '';
                const hasUnusualTraffic = bodyText.includes('unusual traffic') || 
                                         bodyText.includes('detected unusual') ||
                                         bodyText.includes('We have detected unusual traffic') ||
                                         bodyText.includes('请稍后再试');
                
                const hasCaptchaElement = document.querySelector('.captcha, .verification, [class*="captcha"], [class*="verify"], [class*="challenge"]');
                
                return hasUnusualTraffic || hasCaptchaElement !== null;
            });
            
            return hasChallenge;
        } catch (error) {
            return false;
        }
    }

    /**
     * Attempt to login to Taobao if not already logged in
     */
    private async ensureLoggedIn(page: Page): Promise<boolean> {
        try {
            // First check for CAPTCHA/verification challenge
            const hasChallenge = await this.hasVerificationChallenge(page);
            if (hasChallenge) {
                this.logger.error('═══════════════════════════════════════════════════════');
                this.logger.error('🚫 TAOBAO VERIFICATION CHALLENGE DETECTED');
                this.logger.error('═══════════════════════════════════════════════════════');
                this.logger.error('Taobao has detected automated traffic and is showing a verification challenge.');
                this.logger.error('With Developer plan, Browserbase should handle this automatically.');
                this.logger.error('If challenge persists, please wait a few minutes and try again.');
                this.logger.error('═══════════════════════════════════════════════════════');
                
                // Wait a bit to see if Browserbase's CAPTCHA solving handles it
                this.logger.log('Waiting for Browserbase CAPTCHA solving to handle challenge...');
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
                
                // Check again
                const stillHasChallenge = await this.hasVerificationChallenge(page);
                if (stillHasChallenge) {
                    this.logger.warn('⚠️ Verification challenge still present after waiting');
                    return false;
                } else {
                    this.logger.log('✅ Verification challenge resolved (possibly by Browserbase)');
                }
            }
            
            // Check if already logged in
            const loggedIn = await this.isLoggedIn(page);
            if (loggedIn) {
                this.logger.log('✅ Already logged in to Taobao');
                return true;
            }
            
            // Check if login prompt is shown
            const hasLoginPrompt = await page.evaluate(() => {
                const bodyText = document.body.innerText || '';
                return bodyText.includes('请登录') || bodyText.includes('登录');
            });
            
            if (hasLoginPrompt) {
                this.logger.log('Login required - starting QR code login...');
                return await this.qrCodeLogin(page);
            }
            
            return true;
        } catch (error: any) {
            this.logger.error(`Error checking/ensuring login: ${error.message}`);
            return false;
        }
    }

    /**
     * Scrape search results from Taobao
     * Note: This is a basic implementation. Taobao may require additional anti-bot bypassing
     */
    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`Scraping search results from Taobao: ${url}`);
        this.logger.warn('Taobao scraping may be blocked by anti-bot measures. This is a basic implementation.');

        let page = await this.createPage();

        try {
            // Retry logic for page.goto with different strategies
            let pageLoaded = false;
            let lastError: Error | null = null;
            const maxRetries = 3;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    this.logger.log(`Attempt ${attempt}/${maxRetries} to load page`);
                    
                    // Try different wait strategies
                    const waitStrategy = attempt === 1 ? 'networkidle2' : 
                                       attempt === 2 ? 'domcontentloaded' : 
                                       'load';
                    
                    // Add a small delay before navigation to appear more human-like
                    if (attempt > 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                    // Navigate with referer for Taobao
                    await page.goto(url, { 
                        waitUntil: waitStrategy as any, 
                        timeout: 60000,
                        referer: 'https://www.taobao.com/'
                    });
                    
                    pageLoaded = true;
                    this.logger.log(`Page loaded successfully on attempt ${attempt}`);
                    break;
                } catch (error: any) {
                    lastError = error;
                    this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);
                    
                    if (error.message.includes('ERR_EMPTY_RESPONSE') || 
                        error.message.includes('net::ERR') ||
                        error.message.includes('Connection closed')) {
                        // Network error - wait longer before retry
                        if (attempt < maxRetries) {
                            const waitTime = attempt * 5000; // 5s, 10s
                            this.logger.log(`Waiting ${waitTime}ms before retry...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            
                            // Try to close the old page and create a new one
                            try {
                                if (!page.isClosed()) {
                                    await page.close();
                                }
                            } catch (e) {
                                // Ignore close errors
                            }
                            
                            // Create a new page for retry
                            this.logger.log('Creating new page for retry...');
                            page = await this.createPage();
                        }
                    } else {
                        // Non-network error, don't retry
                        throw error;
                    }
                }
            }
            
            if (!pageLoaded && lastError) {
                throw new Error(`Failed to load page after ${maxRetries} attempts: ${lastError.message}`);
            }

            // Wait for results - Taobao's structure may vary and needs more time
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check current page URL - if we're on login page, we need to handle login first
            const currentUrl = page.url();
            const isOnLoginPage = currentUrl.includes('login');
            const isOnSearchPage = currentUrl.includes('s.taobao.com/search');
            
            // If we're on login page, attempt login
            if (isOnLoginPage) {
                this.logger.log('Currently on login page - attempting login...');
                const loginSuccess = await this.ensureLoggedIn(page);
                
                if (loginSuccess) {
                    // Navigate back to search URL after successful login
                    this.logger.log('Login successful! Navigating back to search page...');
                    try {
                        await page.goto(url, { 
                            waitUntil: 'networkidle2', 
                            timeout: 60000,
                            referer: 'https://www.taobao.com/'
                        });
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        // Verify we're on search page now
                        const newUrl = page.url();
                        if (newUrl.includes('s.taobao.com/search')) {
                            this.logger.log('✅ Successfully navigated to search page');
                        } else {
                            this.logger.warn(`⚠️ Navigation may have failed - current URL: ${newUrl.substring(0, 80)}`);
                        }
                    } catch (e) {
                        this.logger.warn('Error navigating to search page after login:', e.message);
                    }
                } else {
                    this.logger.warn('Login failed or not completed. Attempting to navigate to search page anyway...');
                    // Try to navigate to search page even if login failed
                    try {
                        await page.goto(url, { 
                            waitUntil: 'networkidle2', 
                            timeout: 60000,
                            referer: 'https://www.taobao.com/'
                        });
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (e) {
                        this.logger.warn('Error navigating to search page:', e.message);
                    }
                }
            } else if (!isOnSearchPage) {
                // We're on some other page, navigate to search page
                this.logger.log(`Not on search page (current: ${currentUrl.substring(0, 80)}), navigating to search...`);
                try {
                    await page.goto(url, { 
                        waitUntil: 'networkidle2', 
                        timeout: 60000,
                        referer: 'https://www.taobao.com/'
                    });
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (e) {
                    this.logger.warn('Error navigating to search page:', e.message);
                }
            } else {
                // We're already on search page, check if login is needed
                this.logger.log('Already on search page, checking if login is required...');
                const loginSuccess = await this.ensureLoggedIn(page);
                if (loginSuccess) {
                    // Reload page after login
                    this.logger.log('Login successful, reloading search page...');
                    try {
                        await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (e) {
                        this.logger.warn('Error reloading page:', e.message);
                    }
                }
            }

            // Final check - ensure we're on the search page before extracting products
            const finalUrl = page.url();
            if (!finalUrl.includes('s.taobao.com/search')) {
                this.logger.error(`⚠️ Not on search page! Current URL: ${finalUrl}`);
                this.logger.error('Attempting to navigate to search page one more time...');
                try {
                    await page.goto(url, { 
                        waitUntil: 'networkidle2', 
                        timeout: 60000,
                        referer: 'https://www.taobao.com/'
                    });
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    const verifyUrl = page.url();
                    if (!verifyUrl.includes('s.taobao.com/search')) {
                        throw new Error(`Still not on search page after navigation. URL: ${verifyUrl}`);
                    }
                    this.logger.log('✅ Now on search page');
                } catch (e: any) {
                    this.logger.error(`Failed to navigate to search page: ${e.message}`);
                    throw new Error(`Cannot proceed - not on search page. Current URL: ${finalUrl}`);
                }
            }
            
            // Check for CAPTCHA or blocking
            const pageContent = await page.content();
            const pageTitle = await page.title();
            const pageUrl = page.url();
            
            this.logger.log(`Page loaded - Title: ${pageTitle}, URL: ${pageUrl.substring(0, 100)}`);
            
            // Check for verification challenge
            const hasChallenge = await this.hasVerificationChallenge(page);
            if (hasChallenge) {
                this.logger.error('🚫 Verification challenge detected on search page');
                this.logger.error('This may prevent product extraction. Browserbase should handle this automatically.');
                // Wait a bit for Browserbase to solve it
                this.logger.log('Waiting 10 seconds for Browserbase CAPTCHA solving...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
            
            // Check if we're blocked or redirected
            if (pageContent.includes('验证') || pageContent.includes('验证码') || 
                pageContent.includes('captcha') || pageTitle.includes('验证')) {
                this.logger.warn('CAPTCHA or verification page detected');
            }

            // Intercept network requests to find product data API calls
            const productDataFromNetwork: any[] = [];
            const networkDataPromises: Promise<any>[] = [];
            
            page.on('response', async (response) => {
                const url = response.url();
                // Taobao often loads products via API calls
                if (url.includes('search') || url.includes('item') || url.includes('auction') || url.includes('msearch') || url.includes('suggest')) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('json') || contentType.includes('javascript') || contentType.includes('text')) {
                            const promise = response.text().then(text => {
                                if (text && (text.includes('item') || text.includes('auction') || text.includes('nid') || text.includes('itemList'))) {
                                    this.logger.log(`Found potential product data in network response: ${url.substring(0, 150)}`);
                                    try {
                                        const jsonData = JSON.parse(text);
                                        if (jsonData && (jsonData.itemList || jsonData.auctions || jsonData.data)) {
                                            this.logger.log(`Extracted product data from network: ${url}`);
                                            productDataFromNetwork.push({ url, data: jsonData });
                                        }
                                    } catch (e) {
                                        // Not JSON, but might contain product IDs
                                        const nidMatches = text.match(/"nid"\s*:\s*"(\d+)"/g);
                                        if (nidMatches && nidMatches.length > 0) {
                                            this.logger.log(`Found ${nidMatches.length} product IDs in network response: ${url.substring(0, 100)}`);
                                        }
                                    }
                                }
                            }).catch(() => {
                                // Ignore errors
                            });
                            networkDataPromises.push(promise);
                        }
                    } catch (e) {
                        // Ignore errors in network interception
                    }
                }
            });

            // Wait for products to load dynamically
            // Taobao loads products via JavaScript, so we need to wait for them
            let loadingComplete = false;
            let waitAttempts = 0;
            const maxWaitAttempts = 15; // Wait up to 30 seconds (2s * 15)
            
            while (!loadingComplete && waitAttempts < maxWaitAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const pageState = await page.evaluate(() => {
                    // Check for loading indicators
                    const loadingIndicators = document.querySelectorAll('.loading, .load-more, [class*="loading"], [class*="Loading"]');
                    const hasLoading = loadingIndicators.length > 0 && 
                        Array.from(loadingIndicators).some(el => {
                            const text = el.textContent?.toLowerCase() || '';
                            return text.includes('加载') || text.includes('loading');
                        });
                    
                    // Check for product links (try multiple patterns)
                    const itemLinks = document.querySelectorAll('a[href*="/item/"], a[href*="/detail/"], a[href*="item.htm"], a[href*="detail.htm"]');
                    const hasProducts = itemLinks.length > 0;
                    
                    // Check for product containers
                    const containers = document.querySelectorAll('.item, .Card--, [data-item-id], .b-item, .item-box, [data-nid]');
                    const hasContainers = containers.length > 0;
                    
                    // Try to find products in script tags (Taobao often embeds data in JSON)
                    let scriptDataFound = false;
                    const scripts = document.querySelectorAll('script');
                    scripts.forEach(script => {
                        const text = script.textContent || '';
                        if (text.includes('g_page_config') || text.includes('g_config') || 
                            text.includes('itemList') || text.includes('auctions')) {
                            scriptDataFound = true;
                        }
                    });
                    
                    // Check for clickable elements that might load products
                    const loadButtons = document.querySelectorAll('button, .btn, [class*="load"], [class*="more"]');
                    const hasLoadButtons = loadButtons.length > 0;
                    
                    return {
                        hasLoading,
                        hasProducts,
                        hasContainers,
                        itemLinkCount: itemLinks.length,
                        containerCount: containers.length,
                        scriptDataFound,
                        hasLoadButtons: hasLoadButtons,
                    };
                });
                
                this.logger.log(`Wait attempt ${waitAttempts + 1}: ${JSON.stringify(pageState)}`);
                
                // Try clicking "Load More" or similar buttons if products aren't loading
                if (!pageState.hasProducts && pageState.hasLoadButtons && waitAttempts > 3) {
                    await page.evaluate(() => {
                        const buttons = document.querySelectorAll('button, .btn, [class*="load"], [class*="more"]');
                        buttons.forEach((btn: Element) => {
                            const text = (btn as HTMLElement).textContent?.toLowerCase() || '';
                            if (text.includes('加载') || text.includes('更多') || text.includes('load') || text.includes('more')) {
                                (btn as HTMLElement).click();
                            }
                        });
                    });
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
                // If we have products or containers, and no loading indicator, we're done
                if ((pageState.hasProducts || (pageState.hasContainers && pageState.containerCount > 5)) && !pageState.hasLoading) {
                    loadingComplete = true;
                    this.logger.log(`Products loaded: ${pageState.itemLinkCount} links, ${pageState.containerCount} containers`);
                }
                
                // Scroll to trigger lazy loading
                try {
                    await page.evaluate(() => {
                        window.scrollBy(0, 500);
                    });
                } catch (e) {
                    // Page might have been closed/navigated
                    this.logger.warn('Error scrolling, page may have been closed');
                    break;
                }
                
                waitAttempts++;
            }
            
            // Wait for network requests to complete
            try {
                await Promise.all(networkDataPromises);
                if (productDataFromNetwork.length > 0) {
                    this.logger.log(`Found ${productDataFromNetwork.length} network responses with product data`);
                }
            } catch (e) {
                this.logger.warn('Error waiting for network requests:', e.message);
            }
            
            // If still loading, try to extract from script tags
            if (!loadingComplete) {
                this.logger.warn('Products may not have loaded via DOM. Trying to extract from script tags...');
                
                // Check if page is actually blocked or requires login
                let pageState: any = {};
                try {
                    pageState = await page.evaluate(() => {
                        const bodyText = document.body.innerText || '';
                        return {
                            hasLoginPrompt: bodyText.includes('请登录') || bodyText.includes('登录'),
                            hasBlocking: bodyText.includes('验证') || bodyText.includes('验证码'),
                            hasProducts: document.querySelectorAll('a[href*="/item/"], [data-nid]').length > 0,
                            bodyTextLength: bodyText.length,
                        };
                    });
                    
                    this.logger.log(`Final page state: ${JSON.stringify(pageState)}`);
                    
                    if (pageState.hasLoginPrompt) {
                        this.logger.warn('Taobao may require login to view products');
                    }
                } catch (e) {
                    this.logger.warn('Error checking page state (page may have been closed):', e.message);
                }
            }

            // Final scroll to load all products
            try {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                this.logger.warn('Error in final scroll (page may have been closed):', e.message);
            }
            
            // Wait a bit more after products are detected to ensure DOM is fully rendered
            if (loadingComplete) {
                this.logger.log('Products detected, waiting 2 more seconds for DOM to stabilize...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Get page info for debugging
            let pageInfo: any = {};
            try {
                pageInfo = await page.evaluate(() => {
                    // Use the same selector as wait loop and extraction
                    const itemLinks = document.querySelectorAll('a[href*="/item/"], a[href*="/detail/"], a[href*="item.htm"], a[href*="detail.htm"]');
                    return {
                        title: document.title,
                        url: window.location.href,
                        bodyText: document.body.innerText.substring(0, 500),
                        hasItemLinks: itemLinks.length,
                        hasProductContainers: document.querySelectorAll('.item, .Card--, [data-item-id]').length,
                        totalLinks: document.querySelectorAll('a').length,
                    };
                });
                
                this.logger.log(`Page info: ${JSON.stringify(pageInfo, null, 2)}`);
            } catch (e) {
                this.logger.warn('Error getting page info (page may have been closed):', e.message);
            }

            // Extract products from network responses first
            const productsFromNetwork: ScrapedProductSummary[] = [];
            for (const networkData of productDataFromNetwork) {
                try {
                    const data = networkData.data;
                    if (data.itemList && Array.isArray(data.itemList)) {
                        data.itemList.forEach((item: any) => {
                            if (item && (item.nid || item.item_id)) {
                                const itemId = item.nid || item.item_id;
                                productsFromNetwork.push({
                                    productName: item.title || item.raw_title || 'Taobao Product',
                                    productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                    image: item.pic_url || item.img || '',
                                    productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                    offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                    rating: parseFloat(item.rate || 0),
                                    reviewCount: parseInt(item.comment_count || 0),
                                    inStock: true,
                                });
                            }
                        });
                    }
                    if (data.auctions && Array.isArray(data.auctions)) {
                        data.auctions.forEach((item: any) => {
                            if (item && (item.nid || item.item_id)) {
                                const itemId = item.nid || item.item_id;
                                productsFromNetwork.push({
                                    productName: item.title || item.raw_title || 'Taobao Product',
                                    productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                    image: item.pic_url || item.img || '',
                                    productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                    offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                    rating: parseFloat(item.rate || 0),
                                    reviewCount: parseInt(item.comment_count || 0),
                                    inStock: true,
                                });
                            }
                        });
                    }
                } catch (e) {
                    this.logger.warn(`Error processing network data: ${e.message}`);
                }
            }
            
            if (productsFromNetwork.length > 0) {
                this.logger.log(`Found ${productsFromNetwork.length} products from network requests`);
            }

            // Try to extract products from script tags and global variables (Taobao often embeds data in JSON)
            let productsFromScripts: ScrapedProductSummary[] = [];
            try {
                productsFromScripts = await page.evaluate(() => {
                    const results: ScrapedProductSummary[] = [];
                    
                    // First, try to access window.g_page_config directly (Taobao's main data structure)
                    try {
                        const gConfig = (window as any).g_page_config;
                        if (gConfig) {
                            
                            // Try mainInfo.itemList
                            if (gConfig.mainInfo && gConfig.mainInfo.itemList) {
                                gConfig.mainInfo.itemList.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id || item.id)) {
                                        const itemId = item.nid || item.item_id || item.id;
                                        const title = item.title || item.raw_title || item.name || '';
                                        const price = item.view_price || item.price || item.realPrice || '0';
                                        const picUrl = item.pic_url || item.img || item.image || '';
                                        
                                        results.push({
                                            productName: title || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: picUrl,
                                            productPrice: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || item.rating || 0),
                                            reviewCount: parseInt(item.comment_count || item.commentCount || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                            
                            // Try other possible paths
                            if (gConfig.data && gConfig.data.itemList) {
                                gConfig.data.itemList.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id)) {
                                        const itemId = item.nid || item.item_id;
                                        results.push({
                                            productName: item.title || item.raw_title || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: item.pic_url || item.img || '',
                                            productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || 0),
                                            reviewCount: parseInt(item.comment_count || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                            
                            // Try auctions array
                            if (gConfig.auctions && Array.isArray(gConfig.auctions)) {
                                gConfig.auctions.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id)) {
                                        const itemId = item.nid || item.item_id;
                                        results.push({
                                            productName: item.title || item.raw_title || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: item.pic_url || item.img || '',
                                            productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || 0),
                                            reviewCount: parseInt(item.comment_count || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                        }
                    } catch (e) {
                    }
                    
                    // Try window.g_config - check all possible structures
                    try {
                        const gConfig = (window as any).g_config;
                        if (gConfig) {
                            
                            // Try different paths in g_config
                            if (gConfig.itemList && Array.isArray(gConfig.itemList)) {
                                gConfig.itemList.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id)) {
                                        const itemId = item.nid || item.item_id;
                                        results.push({
                                            productName: item.title || item.raw_title || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: item.pic_url || item.img || '',
                                            productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || 0),
                                            reviewCount: parseInt(item.comment_count || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                            
                            // Try g_config.data
                            if (gConfig.data) {
                                if (gConfig.data.itemList) {
                                    gConfig.data.itemList.forEach((item: any) => {
                                        if (item && (item.nid || item.item_id)) {
                                            const itemId = item.nid || item.item_id;
                                            results.push({
                                                productName: item.title || item.raw_title || 'Taobao Product',
                                                productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                                image: item.pic_url || item.img || '',
                                                productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                                offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                                rating: parseFloat(item.rate || 0),
                                                reviewCount: parseInt(item.comment_count || 0),
                                                inStock: true,
                                            });
                                        }
                                    });
                                }
                            }
                            
                            // Log the full g_config structure for debugging (limited size)
                            try {
                                const configStr = JSON.stringify(gConfig).substring(0, 1000);
                            } catch (e) {
                            }
                        }
                    } catch (e) {
                    }
                    
                    // Try window.g_bizdata - Taobao often stores product data here
                    try {
                        const gBizdata = (window as any).g_bizdata;
                        if (gBizdata) {
                            
                            // Log structure for debugging
                            try {
                                const preview = JSON.stringify(gBizdata).substring(0, 500);
                            } catch (e) {
                            }
                            
                            // g_bizdata might be an object with itemList or auctions
                            if (gBizdata.itemList && Array.isArray(gBizdata.itemList)) {
                                gBizdata.itemList.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id || item.id)) {
                                        const itemId = item.nid || item.item_id || item.id;
                                        results.push({
                                            productName: item.title || item.raw_title || item.name || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: item.pic_url || item.img || item.image || '',
                                            productPrice: parseFloat(String(item.view_price || item.price || item.realPrice || 0).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(item.view_price || item.price || item.realPrice || 0).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || item.rating || 0),
                                            reviewCount: parseInt(item.comment_count || item.commentCount || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                            
                            // Try g_bizdata.auctions
                            if (gBizdata.auctions && Array.isArray(gBizdata.auctions)) {
                                gBizdata.auctions.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id)) {
                                        const itemId = item.nid || item.item_id;
                                        results.push({
                                            productName: item.title || item.raw_title || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: item.pic_url || item.img || '',
                                            productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || 0),
                                            reviewCount: parseInt(item.comment_count || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                            
                            // Try g_bizdata.data.itemList
                            if (gBizdata.data && gBizdata.data.itemList) {
                                gBizdata.data.itemList.forEach((item: any) => {
                                    if (item && (item.nid || item.item_id)) {
                                        const itemId = item.nid || item.item_id;
                                        results.push({
                                            productName: item.title || item.raw_title || 'Taobao Product',
                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                            image: item.pic_url || item.img || '',
                                            productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                            rating: parseFloat(item.rate || 0),
                                            reviewCount: parseInt(item.comment_count || 0),
                                            inStock: true,
                                        });
                                    }
                                });
                            }
                            
                            // Try to access nested properties more aggressively
                            if (typeof gBizdata === 'object') {
                                for (const key in gBizdata) {
                                    if (gBizdata.hasOwnProperty(key)) {
                                        const value = gBizdata[key];
                                        if (Array.isArray(value) && value.length > 0) {
                                            // Check if it looks like product data
                                            const firstItem = value[0];
                                            if (firstItem && (firstItem.nid || firstItem.item_id || firstItem.id)) {
                                                value.forEach((item: any) => {
                                                    if (item && (item.nid || item.item_id || item.id)) {
                                                        const itemId = item.nid || item.item_id || item.id;
                                                        results.push({
                                                            productName: item.title || item.raw_title || item.name || 'Taobao Product',
                                                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                                            image: item.pic_url || item.img || item.image || '',
                                                            productPrice: parseFloat(String(item.view_price || item.price || item.realPrice || 0).replace(/[^0-9.]/g, '')) || 0,
                                                            offerPrice: parseFloat(String(item.view_price || item.price || item.realPrice || 0).replace(/[^0-9.]/g, '')) || 0,
                                                            rating: parseFloat(item.rate || item.rating || 0),
                                                            reviewCount: parseInt(item.comment_count || item.commentCount || 0),
                                                            inStock: true,
                                                        });
                                                    }
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                    }
                    
                    // Look for product data in script tags - be more aggressive
                    const scripts = document.querySelectorAll('script');
                    
                    scripts.forEach((script, index) => {
                        const text = script.textContent || '';
                        if (text.length < 100) return; // Skip small scripts
                        
                        try {
                            // Try to find g_page_config assignment with more flexible regex
                            if (text.includes('g_page_config') || text.includes('itemList') || text.includes('auctions')) {
                                
                                // Try multiple patterns to extract the config
                                const patterns = [
                                    /g_page_config\s*=\s*(\{[\s\S]{500,100000}\});/,
                                    /window\.g_page_config\s*=\s*(\{[\s\S]{500,100000}\});/,
                                    /var\s+g_page_config\s*=\s*(\{[\s\S]{500,100000}\});/,
                                    /"itemList"\s*:\s*\[([\s\S]{200,50000})\]/,
                                    /"auctions"\s*:\s*\[([\s\S]{200,50000})\]/,
                                ];
                                
                                for (const pattern of patterns) {
                                    const match = text.match(pattern);
                                    if (match) {
                                        try {
                                            const dataStr = match[1];
                                            // Try to parse as JSON or evaluate
                                            let data: any = null;
                                            
                                            // Try JSON.parse first (safe parsing only — no dynamic code execution)
                                            try {
                                                data = JSON.parse(dataStr);
                                            } catch {
                                                // Fallback: extract nid values directly via regex (no dynamic eval)
                                                {
                                                    const nidMatches = dataStr.match(/"nid"\s*:\s*"([^"]+)"/g);
                                                    if (nidMatches) {
                                                        nidMatches.forEach((nidMatch: string) => {
                                                            const nid = nidMatch.match(/"nid"\s*:\s*"([^"]+)"/)?.[1];
                                                            if (nid) {
                                                                results.push({
                                                                    productName: 'Taobao Product',
                                                                    productUrl: `https://item.taobao.com/item.htm?id=${nid}`,
                                                                    image: '',
                                                                    productPrice: 0,
                                                                    offerPrice: 0,
                                                                    rating: 0,
                                                                    reviewCount: 0,
                                                                    inStock: true,
                                                                });
                                                            }
                                                        });
                                                    }
                                                }
                                            }
                                            
                                            // Process extracted data
                                            if (data) {
                                                const itemList = data.itemList || data.auctions || (Array.isArray(data) ? data : []);
                                                if (Array.isArray(itemList)) {
                                                    itemList.forEach((item: any) => {
                                                        if (item && (item.nid || item.item_id || item.id)) {
                                                            const itemId = item.nid || item.item_id || item.id;
                                                            const title = item.title || item.raw_title || item.name || '';
                                                            const price = item.view_price || item.price || item.realPrice || '0';
                                                            const picUrl = item.pic_url || item.img || item.image || '';
                                                            
                                                            results.push({
                                                                productName: title || 'Taobao Product',
                                                                productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                                                image: picUrl,
                                                                productPrice: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0,
                                                                offerPrice: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0,
                                                                rating: parseFloat(item.rate || item.rating || 0),
                                                                reviewCount: parseInt(item.comment_count || item.commentCount || 0),
                                                                inStock: true,
                                                            });
                                                        }
                                                    });
                                                }
                                                
                                                // Also check nested structures
                                                if (data.mainInfo && data.mainInfo.itemList) {
                                                    data.mainInfo.itemList.forEach((item: any) => {
                                                        if (item && (item.nid || item.item_id)) {
                                                            const itemId = item.nid || item.item_id;
                                                            results.push({
                                                                productName: item.title || item.raw_title || 'Taobao Product',
                                                                productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                                                image: item.pic_url || item.img || '',
                                                                productPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                                                offerPrice: parseFloat(String(item.view_price || item.price || 0).replace(/[^0-9.]/g, '')) || 0,
                                                                rating: parseFloat(item.rate || 0),
                                                                reviewCount: parseInt(item.comment_count || 0),
                                                                inStock: true,
                                                            });
                                                        }
                                                    });
                                                }
                                            }
                                        } catch (e) {
                                        }
                                    }
                                }
                            }
                            
                            // Also try to extract nid values directly from any script
                            if (text.includes('"nid"') || text.includes("'nid'")) {
                                const nidMatches = text.match(/(?:nid|item_id|id)["']?\s*:\s*["']?(\d+)/g);
                                if (nidMatches && nidMatches.length > 0) {
                                    nidMatches.forEach((match: string) => {
                                        const idMatch = match.match(/(\d+)/);
                                        if (idMatch && idMatch[1]) {
                                            const itemId = idMatch[1];
                                            // Only add if it looks like a valid Taobao item ID (usually 12+ digits)
                                            if (itemId.length >= 10) {
                                                results.push({
                                                    productName: 'Taobao Product',
                                                    productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                                                    image: '',
                                                    productPrice: 0,
                                                    offerPrice: 0,
                                                    rating: 0,
                                                    reviewCount: 0,
                                                    inStock: true,
                                                });
                                            }
                                        }
                                    });
                                }
                            }
                        } catch (e) {
                            // Ignore errors
                        }
                    });
                    
                    // Remove duplicates
                    const uniqueResults = results.filter((product, index, self) =>
                        index === self.findIndex((p) => p.productUrl === product.productUrl)
                    );
                    
                    return uniqueResults;
                });
                
                if (productsFromScripts.length > 0) {
                    this.logger.log(`Found ${productsFromScripts.length} products from script tags/global variables`);
                } else {
                    // Debug: Check what's actually in the scripts
                    const debugInfo = await page.evaluate(() => {
                        const scripts = document.querySelectorAll('script');
                        const info: any = {
                            totalScripts: scripts.length,
                            scriptsWithData: [] as any[],
                            windowKeys: Object.keys(window).filter(k => k.includes('g_') || k.includes('config') || k.includes('page')),
                        };
                        
                        scripts.forEach((script, index) => {
                            const text = script.textContent || '';
                            if (text.length > 500 && (text.includes('g_page_config') || text.includes('itemList') || text.includes('auctions'))) {
                                info.scriptsWithData.push({
                                    index,
                                    length: text.length,
                                    hasGPageConfig: text.includes('g_page_config'),
                                    hasItemList: text.includes('itemList'),
                                    hasAuctions: text.includes('auctions'),
                                    preview: text.substring(0, 200),
                                });
                            }
                        });
                        
                        // Check window objects
                        try {
                            info.g_page_config_exists = !!(window as any).g_page_config;
                            info.g_config_exists = !!(window as any).g_config;
                            if ((window as any).g_page_config) {
                                info.g_page_config_keys = Object.keys((window as any).g_page_config);
                            }
                        } catch (e) {
                            info.windowError = String(e);
                        }
                        
                        return info;
                    });
                    
                    this.logger.log(`Script extraction debug info: ${JSON.stringify(debugInfo, null, 2)}`);
                }
            } catch (error) {
                this.logger.warn(`Error extracting from scripts: ${error.message}`);
                if (error.stack) {
                    this.logger.warn(`Stack: ${error.stack}`);
                }
            }

            // Extract product data from DOM
            const extractionResult = await page.evaluate(() => {
                const results: ScrapedProductSummary[] = [];
                const debugInfo: any = {
                    allProductLinksCount: 0,
                    seenItemIdsCount: 0,
                    productElementsCount: 0,
                    processedCount: 0,
                    addedCount: 0,
                    errors: [] as string[],
                };
                
                // First, try to find all product links directly (try multiple URL patterns)
                // Use the EXACT same selector as the wait loop
                const allProductLinks = document.querySelectorAll('a[href*="/item/"], a[href*="/detail/"], a[href*="item.htm"], a[href*="detail.htm"]');
                debugInfo.allProductLinksCount = allProductLinks.length;
                
                // Also try to find links by extracting item IDs from URLs in the page
                const allLinks = document.querySelectorAll('a[href]');
                const itemIdPattern = /[?&]id=(\d{10,})/; // Taobao item IDs are usually 10+ digits
                const seenItemIds = new Set<string>();
                const productLinksById: Map<string, HTMLAnchorElement> = new Map();
                
                allLinks.forEach((link) => {
                    const href = (link as HTMLAnchorElement).href || link.getAttribute('href') || '';
                    const idMatch = href.match(itemIdPattern);
                    if (idMatch && idMatch[1] && !seenItemIds.has(idMatch[1])) {
                        seenItemIds.add(idMatch[1]);
                        productLinksById.set(idMatch[1], link as HTMLAnchorElement);
                    }
                });
                
                debugInfo.seenItemIdsCount = seenItemIds.size;
                
                // If we found item IDs but no product links via selector, create products from IDs
                // This is a fallback when the normal link selector doesn't work
                if (allProductLinks.length === 0 && seenItemIds.size > 0) {
                    debugInfo.errors.push(`No product links found via selector, but found ${seenItemIds.size} item IDs. Creating products from IDs...`);
                    seenItemIds.forEach((itemId) => {
                        const link = productLinksById.get(itemId);
                        let productName = 'Taobao Product';
                        let image = '';
                        let price = 0;
                        
                        if (link) {
                            // Try to extract name from link
                            productName = link.getAttribute('title') || link.textContent?.trim() || 'Taobao Product';
                            
                            // Try to find image near the link
                            let container = link.closest('.item, .Card--, [data-item-id], [data-nid], [class*="item"]');
                            if (container) {
                                const img = container.querySelector('img');
                                if (img) {
                                    image = img.getAttribute('src') || img.getAttribute('data-src') || '';
                                }
                                
                                // Try to find price
                                const priceEl = container.querySelector('.price, .item-price, [class*="price"]');
                                if (priceEl) {
                                    const priceText = priceEl.textContent?.trim() || '';
                                    const priceMatch = priceText.match(/[\d.]+/);
                                    if (priceMatch) {
                                        price = parseFloat(priceMatch[0]);
                                    }
                                }
                            }
                        }
                        
                        results.push({
                            productName: productName,
                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                            image: image,
                            productPrice: price,
                            offerPrice: price,
                            rating: 0,
                            reviewCount: 0,
                            inStock: true,
                        });
                    });
                    debugInfo.addedCount = results.length;
                    debugInfo.errors.push(`Created ${results.length} products from item IDs`);
                    // Return early if we created products from IDs
                    if (results.length > 0) {
                        return { results, debugInfo };
                    }
                }
                
                // Try multiple selectors for Taobao product containers
                let productElements: Element[] = [];
                const containerSelectors = [
                    '.Card--doubleCardWrapper--',
                    '.Card--normalCard--',
                    '.item',
                    '[data-category="auctions"]',
                    '.item-wrapper',
                    '.item.J_MouserOnverReq',
                    '.items .item',
                    '.Card--doubleCardWrapper--item',
                    '[data-item-id]',
                    '[data-nid]', // Taobao often uses data-nid for product IDs
                    '.b-item',
                    '.item-box',
                    '.product-item',
                    '.J_MouserOnverReq', // Taobao hover class
                    '[data-item]',
                    '[class*="item"]', // More generic - any element with "item" in class
                    '[class*="Item"]',
                    '[class*="product"]',
                ];

                for (const selector of containerSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements && elements.length > 0) {
                        productElements = Array.from(elements);
                        break;
                    }
                }

                // If no products found with common selectors, use product links directly
                if (productElements.length === 0 && allProductLinks.length > 0) {
                    // Group links by their parent containers
                    const seenUrls = new Set<string>();
                    allProductLinks.forEach((link) => {
                        const href = (link as HTMLAnchorElement).href || link.getAttribute('href') || '';
                        // Extract item ID from URL if present
                        const itemIdMatch = href.match(/[?&]id=(\d+)/);
                        const itemId = itemIdMatch ? itemIdMatch[1] : null;
                        
                        if (href && (href.includes('/item/') || itemId) && !seenUrls.has(href)) {
                            seenUrls.add(href);
                            // Try to find the parent container
                            let container = link.closest('.item, .Card--, [data-item-id], .b-item, .item-box, [class*="item"], [class*="Item"]');
                            if (!container) {
                                // Go up the DOM tree to find a suitable container
                                let parent = link.parentElement;
                                let depth = 0;
                                while (parent && depth < 5) {
                                    if (parent.classList.length > 0 || 
                                        parent.hasAttribute('data-item-id') || 
                                        parent.hasAttribute('data-nid') ||
                                        parent.className.toString().includes('item')) {
                                        container = parent;
                                        break;
                                    }
                                    parent = parent.parentElement;
                                    depth++;
                                }
                            }
                            if (container) {
                                productElements.push(container);
                            } else {
                                // Use the link itself as the container
                                productElements.push(link);
                            }
                        }
                    });
                    debugInfo.errors.push(`Created ${productElements.length} product containers from links`);
                }

                // If still no elements, try extracting directly from links
                if (productElements.length === 0 && allProductLinks.length > 0) {
                    debugInfo.errors.push(`Extracting directly from ${allProductLinks.length} product links without containers`);
                    const seenUrls = new Set<string>();
                    allProductLinks.forEach((link) => {
                        const href = (link as HTMLAnchorElement).href || link.getAttribute('href') || '';
                        // Extract item ID from URL
                        const idMatch = href.match(/[?&]id=(\d{10,})/);
                        const itemId = idMatch ? idMatch[1] : null;
                        
                        if (href && (href.includes('/item/') || itemId) && !seenUrls.has(href)) {
                            seenUrls.add(href);
                            productElements.push(link);
                        }
                    });
                    debugInfo.errors.push(`Added ${productElements.length} links as product elements`);
                }
                
                // CRITICAL: If we have links but no containers, process links directly as products
                // This ensures we extract from the 27 detected links
                if (productElements.length === 0 && allProductLinks.length > 0) {
                    debugInfo.errors.push(`CRITICAL: Processing ${allProductLinks.length} links directly as products`);
                    const seenUrls = new Set<string>();
                    allProductLinks.forEach((link) => {
                        try {
                            const href = (link as HTMLAnchorElement).href || link.getAttribute('href') || '';
                            if (!href || seenUrls.has(href)) return;
                            
                            // Extract item ID
                            const idMatch = href.match(/[?&]id=(\d{10,})/);
                            const itemId = idMatch ? idMatch[1] : null;
                            
                            if (href.includes('/item/') || itemId) {
                                seenUrls.add(href);
                                
                                // Extract basic info from link
                                let productName = link.getAttribute('title') || link.textContent?.trim() || 'Taobao Product';
                                if (productName.length < 3) productName = 'Taobao Product';
                                
                                // Try to find image nearby
                                let image = '';
                                let productPrice = 0;
                                let offerPrice = 0;
                                let rating = 0;
                                let reviewCount = 0;
                                
                                let container = link.closest('.item, .Card--, [data-item-id], [data-nid], [class*="item"], [class*="Item"]');
                                if (!container) {
                                    // Go up DOM tree
                                    let parent = link.parentElement;
                                    for (let i = 0; i < 5 && parent; i++) {
                                        if (parent.classList.length > 0) {
                                            container = parent;
                                            break;
                                        }
                                        parent = parent.parentElement;
                                    }
                                }
                                
                                if (container) {
                                    // Find image
                                    const img = container.querySelector('img');
                                    if (img) {
                                        image = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
                                        // Convert relative URLs to absolute
                                        if (image && !image.startsWith('http')) {
                                            if (image.startsWith('//')) {
                                                image = `https:${image}`;
                                            } else if (image.startsWith('/')) {
                                                image = `https://www.taobao.com${image}`;
                                            }
                                        }
                                    }
                                    
                                    // Try to find price
                                    const priceEl = container.querySelector('.price, .item-price, [class*="price"], [class*="Price"]');
                                    if (priceEl) {
                                        const priceText = priceEl.textContent?.trim() || '';
                                        const priceMatch = priceText.match(/[\d.]+/);
                                        if (priceMatch) {
                                            productPrice = parseFloat(priceMatch[0]);
                                            offerPrice = productPrice;
                                        }
                                    }
                                    
                                    // Try to find rating
                                    const ratingEl = container.querySelector('.rate, .rating, [class*="rate"], [class*="rating"]');
                                    if (ratingEl) {
                                        const ratingText = ratingEl.textContent?.trim() || '';
                                        const ratingMatch = ratingText.match(/[\d.]+/);
                                        if (ratingMatch) {
                                            rating = parseFloat(ratingMatch[0]);
                                        }
                                    }
                                    
                                    // Try to find review count
                                    const reviewEl = container.querySelector('.review, .comment, [class*="review"], [class*="comment"]');
                                    if (reviewEl) {
                                        const reviewText = reviewEl.textContent?.trim() || '';
                                        const reviewMatch = reviewText.match(/[\d]+/);
                                        if (reviewMatch) {
                                            reviewCount = parseInt(reviewMatch[0]);
                                        }
                                    }
                                }
                                
                                // Build product URL - ensure it's a full URL
                                let productUrl = href;
                                if (!productUrl.startsWith('http')) {
                                    productUrl = productUrl.startsWith('//') ? `https:${productUrl}` : `https:${productUrl}`;
                                }
                                if (itemId && !productUrl.includes('item.htm')) {
                                    productUrl = `https://item.taobao.com/item.htm?id=${itemId}`;
                                }
                                
                                // Ensure product name is meaningful
                                if (!productName || productName.length < 3 || productName === 'Taobao Product') {
                                    // Try to get better name from link text or nearby elements
                                    const linkText = link.textContent?.trim();
                                    if (linkText && linkText.length > 3 && linkText.length < 200) {
                                        productName = linkText;
                                    } else {
                                        productName = `Taobao Product ${itemId || ''}`.trim();
                                    }
                                }
                                
                                results.push({
                                    productName: productName.substring(0, 200),
                                    productUrl: productUrl,
                                    image: image || undefined, // Match Amazon format (optional string)
                                    productPrice: productPrice || undefined, // Match Amazon format (optional number)
                                    offerPrice: offerPrice || productPrice || undefined,
                                    rating: rating || undefined,
                                    reviewCount: reviewCount || undefined,
                                    inStock: true,
                                });
                            }
                        } catch (e: any) {
                            debugInfo.errors.push(`Error processing link: ${e.message}`);
                        }
                    });
                    debugInfo.addedCount = results.length;
                    debugInfo.errors.push(`Created ${results.length} products directly from links`);
                    
                    if (results.length > 0) {
                        const uniqueProducts = results.filter((product, index, self) =>
                            index === self.findIndex((p) => p.productUrl === product.productUrl)
                        );
                        debugInfo.finalCount = uniqueProducts.length;
                        return { results: uniqueProducts, debugInfo };
                    }
                }
                
                // Also try extracting from item IDs we found earlier if we still have no elements
                if (productElements.length === 0 && seenItemIds.size > 0) {
                    debugInfo.errors.push(`No product elements found, but we have ${seenItemIds.size} item IDs. Creating products from IDs...`);
                    seenItemIds.forEach((itemId) => {
                        const link = productLinksById.get(itemId);
                        let productName = 'Taobao Product';
                        let image = '';
                        let price = 0;
                        
                        if (link) {
                            // Try to extract name from link
                            productName = link.getAttribute('title') || link.textContent?.trim() || 'Taobao Product';
                            
                            // Try to find image near the link
                            let container = link.closest('.item, .Card--, [data-item-id], [data-nid], [class*="item"]');
                            if (container) {
                                const img = container.querySelector('img');
                                if (img) {
                                    image = img.getAttribute('src') || img.getAttribute('data-src') || '';
                                }
                                
                                // Try to find price
                                const priceEl = container.querySelector('.price, .item-price, [class*="price"]');
                                if (priceEl) {
                                    const priceText = priceEl.textContent?.trim() || '';
                                    const priceMatch = priceText.match(/[\d.]+/);
                                    if (priceMatch) {
                                        price = parseFloat(priceMatch[0]);
                                    }
                                }
                            }
                        }
                        
                        results.push({
                            productName: productName,
                            productUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
                            image: image,
                            productPrice: price,
                            offerPrice: price,
                            rating: 0,
                            reviewCount: 0,
                            inStock: true,
                        });
                    });
                    debugInfo.addedCount = results.length;
                    debugInfo.errors.push(`Created ${results.length} products from item IDs`);
                    // Return early if we created products from IDs
                    if (results.length > 0) {
                        const uniqueProducts = results.filter((product, index, self) =>
                            index === self.findIndex((p) => p.productUrl === product.productUrl)
                        );
                        debugInfo.finalCount = uniqueProducts.length;
                        return { results: uniqueProducts, debugInfo };
                    }
                }

                if (productElements.length === 0) {
                    debugInfo.errors.push('No product elements found with any selector');
                    // Log available elements for debugging
                    const sampleClasses = Array.from(document.querySelectorAll('[class]')).slice(0, 30).map(el => el.className);
                    debugInfo.sampleClasses = sampleClasses;
                    debugInfo.dataAttributesCount = Array.from(document.querySelectorAll('[data-item-id], [data-nid]')).length;
                    return { results: [], debugInfo };
                }
                
                debugInfo.productElementsCount = productElements.length;
                debugInfo.processedCount = 0;

                productElements.forEach((element, index) => {
                    debugInfo.processedCount++;
                    try {
                        // Product URL - try multiple selectors
                        let productUrl = '';
                        let linkElement: Element | null = null;
                        
                        // Check if element itself is a link
                        if (element.tagName === 'A') {
                            const href = (element as HTMLAnchorElement).href || element.getAttribute('href') || '';
                            if (href && (href.includes('/item/') || href.includes('/detail/') || href.includes('item.htm') || href.includes('detail.htm'))) {
                                linkElement = element;
                                productUrl = href.startsWith('http') ? href : `https:${href}`;
                            }
                        }
                        
                        // If not, try to find link within element (try multiple URL patterns)
                        if (!linkElement) {
                            linkElement = element.querySelector('a[href*="/item/"], a[href*="/detail/"], a[href*="item.htm"], a[href*="detail.htm"]');
                            if (linkElement) {
                                const href = (linkElement as HTMLAnchorElement).href || linkElement.getAttribute('href') || '';
                                productUrl = href.startsWith('http') ? href : `https:${href}`;
                            }
                        }
                        
                        // Also check for data-nid or data-item-id which might contain product ID
                        if (!productUrl) {
                            const itemId = element.getAttribute('data-nid') || element.getAttribute('data-item-id');
                            if (itemId) {
                                productUrl = `https://item.taobao.com/item.htm?id=${itemId}`;
                            }
                        }
                        
                        // Extract item ID from URL if productUrl is not complete
                        if (!productUrl) {
                            // Try to extract from element's data attributes
                            const nid = element.getAttribute('data-nid') || element.getAttribute('data-item-id');
                            if (nid && nid.length >= 10) {
                                productUrl = `https://item.taobao.com/item.htm?id=${nid}`;
                            }
                        }
                        
                        // Also try to extract ID from any link in the element
                        if (!productUrl) {
                            const anyLink = element.querySelector('a[href*="item"], a[href*="detail"]');
                            if (anyLink) {
                                const href = (anyLink as HTMLAnchorElement).href || anyLink.getAttribute('href') || '';
                                const idMatch = href.match(/[?&]id=(\d+)/);
                                if (idMatch && idMatch[1]) {
                                    productUrl = `https://item.taobao.com/item.htm?id=${idMatch[1]}`;
                                } else if (href.includes('/item/')) {
                                    productUrl = href.startsWith('http') ? href : `https:${href}`;
                                }
                            }
                        }
                        
                        // Skip if no valid product URL
                        if (!productUrl || (!productUrl.includes('/item/') && !productUrl.includes('/detail/') && !productUrl.includes('item.htm') && !productUrl.includes('detail.htm'))) {
                            // Try one more time - check if element has any text that looks like a product
                            const elementText = element.textContent || '';
                            if (elementText.length < 10) {
                                return; // Too short to be a product
                            }
                            // If we have a link element but no URL, try to construct from text
                            if (linkElement && !productUrl) {
                                return; // Can't extract without URL
                            }
                            return;
                        }

                        // Product name - try multiple selectors
                        let productName = '';
                        const nameSelectors = [
                            '.title',
                            '.item-title',
                            '[data-title]',
                            'h3',
                            '.Card--titleText--',
                            '.title-text',
                            '.item-title-text',
                            'a[title]',
                            'h2',
                            'h4',
                            '.name',
                            '.product-name',
                            '[title]',
                        ];

                        for (const selector of nameSelectors) {
                            const nameElement = element.querySelector(selector);
                            if (nameElement) {
                                productName = nameElement.textContent?.trim() || 
                                             nameElement.getAttribute('title') || 
                                             nameElement.getAttribute('data-title') || '';
                                if (productName && productName.length > 3) break; // Ensure meaningful name
                            }
                        }

                        // Fallback to link title or text
                        if (!productName && linkElement) {
                            productName = (linkElement as HTMLElement).getAttribute('title') || 
                                         linkElement.textContent?.trim() || '';
                            
                            // If link text is too short or empty, try parent elements
                            if (!productName || productName.length < 3) {
                                let parent = linkElement.parentElement;
                                let depth = 0;
                                while (parent && depth < 3) {
                                    const parentText = parent.textContent?.trim() || '';
                                    if (parentText && parentText.length > productName.length && parentText.length < 200) {
                                        productName = parentText;
                                        break;
                                    }
                                    parent = parent.parentElement;
                                    depth++;
                                }
                            }
                            
                            // Final fallback
                            if (!productName || productName.length < 3) {
                                productName = 'Taobao Product';
                            }
                        }

                        // Price - try multiple selectors
                        let productPrice = 0;
                        let offerPrice = 0;
                        
                        const priceSelectors = [
                            '.price',
                            '.item-price',
                            '[data-price]',
                            '.Card--priceText--',
                            '.price-text',
                            '.g-price',
                            '.price-current',
                        ];

                        for (const selector of priceSelectors) {
                            const priceElement = element.querySelector(selector);
                            if (priceElement) {
                                const priceText = priceElement.textContent?.trim() || '';
                                // Extract numbers from price (remove currency symbols, commas, etc.)
                                const priceMatch = priceText.match(/[\d.]+/);
                                if (priceMatch) {
                                    productPrice = parseFloat(priceMatch[0]);
                                    offerPrice = productPrice;
                                    break;
                                }
                            }
                        }

                        // Image - try multiple selectors
                        let imageUrl = '';
                        const imageSelectors = [
                            'img[src]',
                            'img[data-src]',
                            'img[data-lazy-src]',
                            'img[data-ks-lazyload]',
                            '.pic img',
                            '.item-pic img',
                            '.Card--pic-- img',
                        ];

                        for (const selector of imageSelectors) {
                            const imgElement = element.querySelector(selector);
                            if (imgElement) {
                                imageUrl = imgElement.getAttribute('src') || 
                                          imgElement.getAttribute('data-src') || 
                                          imgElement.getAttribute('data-lazy-src') ||
                                          imgElement.getAttribute('data-ks-lazyload') || '';
                                
                                // Convert relative URLs to absolute
                                if (imageUrl && !imageUrl.startsWith('http')) {
                                    if (imageUrl.startsWith('//')) {
                                        imageUrl = `https:${imageUrl}`;
                                    } else if (imageUrl.startsWith('/')) {
                                        imageUrl = `https://www.taobao.com${imageUrl}`;
                                    }
                                }
                                
                                if (imageUrl) break;
                            }
                        }

                        // Rating - try multiple selectors
                        let rating = 0;
                        const ratingSelectors = [
                            '.rate',
                            '.rating',
                            '[data-rating]',
                            '.score',
                            '.star-rating',
                        ];

                        for (const selector of ratingSelectors) {
                            const ratingElement = element.querySelector(selector);
                            if (ratingElement) {
                                const ratingText = ratingElement.textContent?.trim() || '';
                                const ratingMatch = ratingText.match(/[\d.]+/);
                                if (ratingMatch) {
                                    rating = parseFloat(ratingMatch[0]);
                                    break;
                                }
                            }
                        }

                        // Review count - try multiple selectors
                        let reviewCount = 0;
                        const reviewSelectors = [
                            '.review',
                            '.comment',
                            '[data-review]',
                            '.comment-count',
                            '.review-count',
                        ];

                        for (const selector of reviewSelectors) {
                            const reviewElement = element.querySelector(selector);
                            if (reviewElement) {
                                const reviewText = reviewElement.textContent?.trim() || '';
                                const reviewMatch = reviewText.match(/[\d]+/);
                                if (reviewMatch) {
                                    reviewCount = parseInt(reviewMatch[0]);
                                    break;
                                }
                            }
                        }

                        // Check if in stock (Taobao usually shows products as available)
                        let inStock = true;
                        const stockElement = element.querySelector('.stock, .inventory, [data-stock], .sold-out');
                        if (stockElement) {
                            const stockText = stockElement.textContent?.toLowerCase() || '';
                            inStock = !stockText.includes('out') && !stockText.includes('缺货') && !stockText.includes('售罄');
                        }

                        // Only add if we have at least a product URL (name can be default)
                        if (productUrl) {
                            // Use default name if not found
                            if (!productName || productName.length < 3) {
                                productName = 'Taobao Product';
                            }
                            debugInfo.addedCount++;
                            results.push({
                                productName: productName.substring(0, 200), // Limit length
                                productUrl: productUrl,
                                image: imageUrl,
                                productPrice: productPrice,
                                offerPrice: offerPrice || productPrice,
                                rating: rating,
                                reviewCount: reviewCount,
                                inStock: inStock,
                            });
                        }
                    } catch (error: any) {
                        debugInfo.errors.push(`Error extracting product ${index}: ${error.message}`);
                    }
                });

                // Remove duplicates based on URL
                const uniqueProducts = results.filter((product, index, self) =>
                    index === self.findIndex((p) => p.productUrl === product.productUrl)
                );

                debugInfo.finalCount = uniqueProducts.length;
                if (uniqueProducts.length > 0) {
                    debugInfo.firstProduct = {
                        name: uniqueProducts[0].productName.substring(0, 50),
                        url: uniqueProducts[0].productUrl,
                    };
                }

                return { results: uniqueProducts, debugInfo };
            });
            
            // Extract products and debug info
            const products = extractionResult.results || [];
            const debugInfo = extractionResult.debugInfo || {};
            
            // Log debug info in backend
            this.logger.log(`DOM extraction debug: ${JSON.stringify(debugInfo, null, 2)}`);

            // Combine products from network, scripts, and DOM
            const allProducts = [...productsFromNetwork, ...productsFromScripts, ...products];
            
            // Remove duplicates based on URL
            const uniqueProducts = allProducts.filter((product, index, self) =>
                index === self.findIndex((p) => p.productUrl === product.productUrl)
            );

            this.logger.log(`Successfully extracted ${uniqueProducts.length} products from Taobao search results (${productsFromNetwork.length} from network, ${productsFromScripts.length} from scripts, ${products.length} from DOM)`);

            return {
                products: uniqueProducts,
                totalResults: uniqueProducts.length,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error) {
            this.logger.error(`Error scraping Taobao search: ${error.message}`, error.stack);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Scrape product details from Taobao
     * Note: This is a basic implementation. Taobao may require additional anti-bot bypassing
     */
    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`Scraping product from Taobao: ${url}`);
        this.logger.warn('Taobao scraping may be blocked by anti-bot measures. This is a basic implementation.');

        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 3000));

            // This is a placeholder - actual implementation would need proper selectors
            const scrapedProduct: ScrapedProduct = {
                productName: 'Taobao Product (Not Implemented)',
                description: 'Taobao scraping requires additional implementation to bypass anti-bot measures',
                productPrice: 0,
                offerPrice: 0,
                sourceUrl: url,
                sourcePlatform: 'Taobao.com',
                placeOfOrigin: 'China',
                productType: 'PHYSICAL',
                metadata: {
                    scrapedAt: new Date().toISOString(),
                    sourceUrl: url,
                    implementationStatus: 'placeholder',
                },
            };

            this.logger.warn('Taobao product scraping is not fully implemented. Returns placeholder data.');

            return scrapedProduct;
        } catch (error) {
            this.logger.error(`Error scraping Taobao product: ${error.message}`, error.stack);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Close the browser instance and cleanup Browserbase session if used
     */
    async close(): Promise<void> {
        const sessionId = this.browserbaseSessionId;
        const isBrowserbaseSession = !!sessionId;
        
        // Close browser connection first
        if (this.browser) {
            try {
                // If connected via Browserbase, disconnect instead of close
                if (isBrowserbaseSession) {
                    await this.browser.disconnect();
                } else {
                    await this.browser.close();
                }
                this.browser = null;
                this.logger.log('Browser instance closed');
            } catch (error: any) {
                this.logger.error(`Error closing browser: ${error.message}`);
            }
        }
        
        // Close Browserbase session if used
        if (sessionId) {
            try {
                await this.browserbaseHelper.closeSession(sessionId);
                this.browserbaseSessionId = null;
                this.logger.log('Browserbase session closed');
            } catch (error: any) {
                this.logger.error(`Error closing Browserbase session: ${error.message}`);
            }
        }
    }
}