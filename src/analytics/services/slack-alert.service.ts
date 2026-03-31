import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SlackAlertService {
  private readonly logger = new Logger(SlackAlertService.name);
  private readonly webhookUrl: string | undefined;

  constructor(private config: ConfigService) {
    this.webhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');
  }

  /**
   * Send a Slack notification for a new unique error.
   * Fire-and-forget — never throws.
   */
  async notifyNewError(data: {
    message: string;
    source: string;
    level: string;
    fingerprint: string;
    pageUrl?: string;
    endpoint?: string;
  }): Promise<void> {
    if (!this.webhookUrl) return;

    const levelEmoji: Record<string, string> = {
      critical: '🔴',
      error: '🟠',
      warning: '🟡',
      info: '🔵',
    };
    const emoji = levelEmoji[data.level] ?? '⚠️';

    const payload = {
      text: `${emoji} *New ${data.level.toUpperCase()} — Ultrasooq*`,
      attachments: [
        {
          color: data.level === 'critical' || data.level === 'error' ? 'danger' : 'warning',
          fields: [
            { title: 'Message', value: data.message.slice(0, 200), short: false },
            { title: 'Source', value: data.source, short: true },
            { title: 'Level', value: data.level, short: true },
            ...(data.pageUrl ? [{ title: 'Page', value: data.pageUrl, short: false }] : []),
            ...(data.endpoint ? [{ title: 'Endpoint', value: data.endpoint, short: false }] : []),
            { title: 'Fingerprint', value: data.fingerprint, short: false },
          ],
          footer: `Ultrasooq Analytics · ${new Date().toISOString()}`,
        },
      ],
    };

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.warn(`Slack alert failed: ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`Slack alert error: ${err.message}`);
    }
  }
}
