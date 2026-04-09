import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000/api/v1';
const AUTH_TOKEN = process.env.SCRAPER_MCP_TOKEN || '';
// Helper to call the NestJS backend
async function callBackend(path, method = 'GET', body) {
    const url = `${BACKEND_URL}${path}`;
    const headers = {
        'Content-Type': 'application/json',
    };
    if (AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }
    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Backend returned ${response.status}: ${text}`);
    }
    return response.json();
}
// Create MCP server
const server = new McpServer({
    name: 'ultrasooq-scraper',
    version: '1.0.0',
});
// ═══════════════════════════════════════════
// SCRAPING CONTROL TOOLS
// ═══════════════════════════════════════════
server.tool('scrape_start', 'Start a scraping job for a specific platform, category, and region', {
    platform: z.enum(['amazon', 'alibaba', 'aliexpress', 'taobao']).describe('Target platform'),
    categoryUrl: z.string().describe('Category or search URL to scrape'),
    categoryPath: z.string().describe('Category path e.g. "Electronics > Smartphones"'),
    region: z.string().optional().describe('Region code (us, ae, uk, de, fr, jp, etc.)'),
    maxProducts: z.number().optional().default(1000).describe('Maximum products to scrape'),
    priority: z.number().min(1).max(10).optional().default(5).describe('Job priority (1=highest)'),
}, async ({ platform, categoryUrl, categoryPath, region, maxProducts, priority }) => {
    const result = await callBackend('/scraper/mega/start', 'POST', {
        platform, categoryUrl, categoryPath, region, maxProducts, priority,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('scrape_progress', 'Get real-time scraping progress stats across all platforms or a specific job', {
    jobId: z.number().optional().describe('Specific job ID (omit for all platforms)'),
    platform: z.string().optional().describe('Filter by platform'),
}, async ({ jobId, platform }) => {
    const params = new URLSearchParams();
    if (jobId)
        params.set('jobId', String(jobId));
    if (platform)
        params.set('platform', platform);
    const result = await callBackend(`/scraper/mega/progress?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('scrape_pause', 'Pause a scraping job or all jobs for a platform', {
    target: z.string().describe('Job ID number, platform name, or "all"'),
}, async ({ target }) => {
    const result = await callBackend('/scraper/mega/pause', 'POST', { target });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('scrape_resume', 'Resume a paused scraping job or platform', {
    target: z.string().describe('Job ID number, platform name, or "all"'),
}, async ({ target }) => {
    const result = await callBackend('/scraper/mega/resume', 'POST', { target });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('scrape_fix', 'Fix a blocked or failed scraping job with a recovery strategy', {
    jobId: z.number().describe('The blocked/failed job ID'),
    strategy: z.enum(['new_session', 'change_region', 'reduce_rate', 'skip', 'wait']).describe('Recovery strategy'),
    newRegion: z.string().optional().describe('New region for change_region strategy'),
    waitMinutes: z.number().optional().describe('Minutes to wait for wait strategy'),
}, async ({ jobId, strategy, newRegion, waitMinutes }) => {
    const result = await callBackend('/scraper/mega/fix', 'POST', {
        jobId, strategy, newRegion, waitMinutes,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('scrape_queue', 'View and manage the scraping job queue', {
    action: z.enum(['list', 'drain', 'stats']).optional().default('stats').describe('Queue action'),
    platform: z.string().optional().describe('Filter by platform'),
}, async ({ action, platform }) => {
    const params = new URLSearchParams();
    if (action)
        params.set('action', action);
    if (platform)
        params.set('platform', platform);
    const result = await callBackend(`/scraper/mega/queue?${params}`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ═══════════════════════════════════════════
// TRANSLATION TOOLS
// ═══════════════════════════════════════════
server.tool('translate_text', 'Translate a batch of scraped product texts from Chinese to English via AI', {
    productIds: z.array(z.number()).optional().describe('Specific product IDs to translate (omit for auto-batch of 50)'),
    batchSize: z.number().optional().default(50).describe('Number of products to translate'),
}, async ({ productIds, batchSize }) => {
    const result = await callBackend('/scraper/mega/translate', 'POST', {
        productIds, batchSize,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('translate_image', 'Extract and translate text from a product image using Opus 4.6 vision', {
    imageUrl: z.string().describe('URL of the product image to OCR and translate'),
    productId: z.number().optional().describe('Associated product ID for storing results'),
}, async ({ imageUrl, productId }) => {
    const result = await callBackend('/scraper/mega/translate-image', 'POST', {
        imageUrl, productId,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ═══════════════════════════════════════════
// CATEGORY TOOLS
// ═══════════════════════════════════════════
server.tool('category_import', 'Fetch and import the category tree from a source platform', {
    platform: z.enum(['amazon', 'alibaba', 'aliexpress', 'taobao']).describe('Platform to import categories from'),
}, async ({ platform }) => {
    const result = await callBackend('/scraper/mega/categories/import', 'POST', { platform });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('category_map', 'Map a source platform category to an Ultrasooq category using AI', {
    sourcePath: z.string().describe('Source category path e.g. "Electronics > Smartphones > Android"'),
    platform: z.enum(['amazon', 'alibaba', 'aliexpress', 'taobao']).describe('Source platform'),
}, async ({ sourcePath, platform }) => {
    const result = await callBackend('/scraper/mega/categories/map', 'POST', {
        sourcePath, platform,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ═══════════════════════════════════════════
// DATA EXPORT TOOLS
// ═══════════════════════════════════════════
server.tool('export_batch', 'Export scraped products to JSON files for backup and audit', {
    platform: z.enum(['amazon', 'alibaba', 'aliexpress', 'taobao']).describe('Platform to export'),
    region: z.string().optional().describe('Region filter'),
    format: z.enum(['json', 'csv']).optional().default('json').describe('Export format'),
}, async ({ platform, region, format }) => {
    const result = await callBackend('/scraper/mega/export', 'POST', {
        platform, region, format,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('import_to_db', 'Bulk import an exported batch into the Ultrasooq database with INACTIVE status', {
    batchId: z.string().describe('Batch ID from export (e.g. "AMAZON-US-2026-04-05-abc123")'),
}, async ({ batchId }) => {
    const result = await callBackend('/scraper/mega/import', 'POST', { batchId });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ═══════════════════════════════════════════
// MONITORING TOOL
// ═══════════════════════════════════════════
server.tool('monitor_health', 'Get full health report: error rates, block status, queue depths, ETAs, platform progress', {}, async () => {
    const result = await callBackend('/scraper/mega/health');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ═══════════════════════════════════════════
// WORKFLOW TOOLS
// ═══════════════════════════════════════════
server.tool('workflow_start', 'Start the full 10M product mega scrape workflow — crash-proof, auto-resuming', {}, async () => {
    const result = await callBackend('/scraper/mega/workflow/start', 'POST');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('workflow_pause', 'Pause the mega scrape workflow — all queues paused, state preserved', {}, async () => {
    const result = await callBackend('/scraper/mega/workflow/pause', 'POST');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('workflow_resume', 'Resume a paused mega scrape workflow', {}, async () => {
    const result = await callBackend('/scraper/mega/workflow/resume', 'POST');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('workflow_status', 'Get the current workflow state, progress checkpoint, and full health report', {}, async () => {
    const result = await callBackend('/scraper/mega/workflow/status');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
server.tool('workflow_reset', 'Reset the workflow state completely — use with caution', {}, async () => {
    const result = await callBackend('/scraper/mega/workflow/reset', 'POST');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Ultrasooq Scraper MCP Server running on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map