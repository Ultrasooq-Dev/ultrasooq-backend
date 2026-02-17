import { Browserbase } from '@browserbasehq/sdk';
import { Logger } from '@nestjs/common';

export interface BrowserbaseSession {
  id: string;
  browserWSEndpoint: string;
  status: string;
}

export class BrowserbaseHelper {
  private readonly logger = new Logger(BrowserbaseHelper.name);
  private readonly apiKey: string;
  private readonly browserbase: Browserbase | null;

  constructor() {
    this.apiKey = process.env.BROWSERBASE_API_KEY || '';
    if (!this.apiKey) {
      this.logger.warn('BROWSERBASE_API_KEY not set. Browserbase features will be disabled.');
      this.browserbase = null;
    } else {
      this.browserbase = new Browserbase({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Create a new Browserbase session
   */
  async createSession(options?: {
    projectId?: string;
    stealth?: boolean;
    proxy?: string;
  }): Promise<BrowserbaseSession> {
    if (!this.browserbase) {
      throw new Error('BROWSERBASE_API_KEY is not configured');
    }

    try {
      const projectId = process.env.BROWSERBASE_PROJECT_ID || options?.projectId;
      
      if (!projectId) {
        throw new Error('BROWSERBASE_PROJECT_ID is required');
      }
      
      const sessionOptions: any = {
        projectId: projectId,
        // Enable Developer plan features
        browserSettings: {
          logSession: true,
          recordSession: true,
          solveCaptchas: true, // Enable automatic CAPTCHA solving (Developer plan+)
        },
        // Proxies disabled as requested
        // proxies: false, // Not using proxies
      };
      
      // If custom proxy is provided, use it (but currently disabled)
      if (options?.proxy) {
        // Proxy support disabled - uncomment below if needed in future
        // sessionOptions.proxies = [{
        //   type: 'external',
        //   url: options.proxy,
        // }];
      }

      this.logger.log(`Creating Browserbase session with options: ${JSON.stringify(sessionOptions)}`);
      
      let session;
      try {
        session = await this.browserbase.sessions.create(sessionOptions);
      } catch (error: any) {
        // Handle specific error cases
        if (error.message && error.message.includes('429')) {
          this.logger.error('═══════════════════════════════════════════════════════');
          this.logger.error('🚫 BROWSERBASE SESSION LIMIT ERROR');
          this.logger.error('═══════════════════════════════════════════════════════');
          this.logger.error('Error: Concurrent sessions limit reached');
          this.logger.error('');
          this.logger.error('This usually means:');
          this.logger.error('1. Your account has a limit of 0 concurrent sessions');
          this.logger.error('2. The Developer plan may not be fully activated yet');
          this.logger.error('3. You may need to contact Browserbase support');
          this.logger.error('');
          this.logger.error('To fix this:');
          this.logger.error('- Check Browserbase dashboard for active sessions');
          this.logger.error('- Wait for sessions to auto-close (usually 5 minutes)');
          this.logger.error('- Contact Browserbase support: support@browserbase.com');
          this.logger.error('- Verify your Developer plan is active in dashboard');
          this.logger.error('═══════════════════════════════════════════════════════');
        }
        throw error;
      }

      this.logger.log(`Browserbase session created: ${JSON.stringify(session, null, 2)}`);

      // The SDK returns connectUrl as the WebSocket endpoint
      if (!session.connectUrl) {
        this.logger.error(`Browserbase response missing connectUrl. Full response: ${JSON.stringify(session)}`);
        throw new Error('Browserbase session created but connectUrl is missing from response');
      }

      if (!session.id) {
        this.logger.error(`Browserbase response missing session ID. Full response: ${JSON.stringify(session)}`);
        throw new Error('Browserbase session created but session ID is missing from response');
      }

      this.logger.log(`✅ Browserbase session created: ${session.id}, endpoint: ${session.connectUrl}`);
      
      return {
        id: session.id,
        browserWSEndpoint: session.connectUrl,
        status: session.status || 'active',
      };
    } catch (error: any) {
      this.logger.error(`Failed to create Browserbase session: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<BrowserbaseSession> {
    if (!this.browserbase) {
      throw new Error('BROWSERBASE_API_KEY is not configured');
    }

    try {
      const session = await this.browserbase.sessions.retrieve(sessionId);

      return {
        id: session.id,
        browserWSEndpoint: session.connectUrl || '',
        status: session.status || 'active',
      };
    } catch (error: any) {
      this.logger.error(`Failed to get Browserbase session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close a session
   * Note: Browserbase sessions auto-close when disconnected from Puppeteer.
   * This method is kept for compatibility but sessions will close automatically.
   */
  async closeSession(sessionId: string): Promise<void> {
    if (!this.browserbase) {
      return;
    }

    // Browserbase sessions automatically close when the browser disconnects.
    // There's no explicit delete method in the SDK, so we just log it.
    this.logger.log(`Browserbase session will auto-close when disconnected: ${sessionId}`);
  }

  /**
   * Check if Browserbase is enabled
   */
  isEnabled(): boolean {
    return !!this.apiKey;
  }
}

