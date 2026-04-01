import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportService } from '../support.service';
import { SupportTrackingService } from '../tracking/support-tracking.service';
import { SelfLearningService } from './self-learning.service';
import { ConfigService } from '@nestjs/config';

export interface BotContext {
  userId: number;
  tradeRole: string;
  currentPage?: string;
  locale: string;
  conversationId: number;
}

export interface BotResponse {
  content: string;
  contentType: 'text' | 'cards' | 'buttons' | 'search_results' | 'navigate' | 'status';
  metadata?: any;
  confidence: number;
}

export interface BotSkill {
  id: string;
  name: string;
  triggers: string[];
  menuItem: boolean;
  roleAccess: string[];
  handler: (context: BotContext, message: string) => Promise<BotResponse>;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private skills: Map<string, BotSkill> = new Map();

  constructor(
    private prisma: PrismaService,
    private supportService: SupportService,
    private tracking: SupportTrackingService,
    private selfLearning: SelfLearningService,
    private config: ConfigService,
  ) {
    this.registerBuiltInSkills();
  }

  /**
   * Process a message from the customer. Routes to skills or AI fallback.
   */
  async processMessage(
    conversationId: number,
    message: string,
    context: BotContext,
  ): Promise<BotResponse> {
    // 1. Check if it's a menu action (direct skill ID)
    const directSkill = this.skills.get(message);
    if (directSkill) {
      const response = await directSkill.handler(context, message);
      await this.supportService.addBotMessage(
        conversationId,
        response.content,
        response.contentType,
        response.metadata,
      );
      this.tracking.track('skill_used', conversationId, { skillId: message, confidence: response.confidence });
      return response;
    }

    // 2. Check self-learning database (fuzzy match from past answers)
    const learned = await this.selfLearning.findAnswer(message, context.locale);
    if (learned && learned.confidence >= 0.6) {
      const response: BotResponse = {
        content: learned.answer,
        contentType: 'text',
        confidence: learned.confidence,
      };
      await this.supportService.addBotMessage(conversationId, response.content, 'text');
      await this.selfLearning.incrementUseCount(learned.id);
      this.tracking.track('learned_answer_used', conversationId, { learningId: learned.id, confidence: learned.confidence });
      return response;
    }

    // 3. Try trigger matching against skills
    const matchedSkill = this.matchSkill(message);
    if (matchedSkill) {
      const response = await matchedSkill.handler(context, message);
      await this.supportService.addBotMessage(
        conversationId,
        response.content,
        response.contentType,
        response.metadata,
      );
      this.tracking.track('skill_triggered', conversationId, { skillId: matchedSkill.id, confidence: response.confidence });
      return response;
    }

    // 4. Try overall search
    const searchResponse = await this.overallSearch(message, context);
    if (searchResponse.confidence >= 0.5) {
      await this.supportService.addBotMessage(
        conversationId,
        searchResponse.content,
        searchResponse.contentType,
        searchResponse.metadata,
      );
      this.tracking.track('overall_search', conversationId, { confidence: searchResponse.confidence });
      return searchResponse;
    }

    // 5. AI fallback (Open Router — minimal, short answer)
    const aiResponse = await this.aiFallback(message, context);
    await this.supportService.addBotMessage(
      conversationId,
      aiResponse.content,
      aiResponse.contentType,
      aiResponse.metadata,
    );
    this.tracking.track('ai_fallback', conversationId, { confidence: aiResponse.confidence });

    // Low confidence → suggest escalation
    if (aiResponse.confidence < 0.4) {
      const escalateMsg = context.locale === 'ar'
        ? 'لم أتمكن من إيجاد إجابة واضحة. هل تريد التحدث مع فريق الدعم؟'
        : "I'm not sure about this. Would you like to talk to our support team?";
      await this.supportService.addBotMessage(conversationId, escalateMsg, 'buttons', {
        buttons: [
          { label: 'Yes, connect me', labelAr: 'نعم، وصلني', action: 'menu_click', value: 'escalate' },
          { label: 'No, thanks', labelAr: 'لا، شكراً', action: 'send_text', value: 'ok' },
        ],
      });
    }

    return aiResponse;
  }

  /**
   * Handle a menu click (direct skill invocation).
   */
  async handleMenuClick(
    conversationId: number,
    menuId: string,
    context: BotContext,
  ): Promise<BotResponse> {
    // Escalate is special
    if (menuId === 'escalate') {
      await this.supportService.escalate(conversationId, 'user_request');
      const content = context.locale === 'ar'
        ? 'جاري توصيلك بفريق الدعم... سيتم الرد قريباً.'
        : 'Connecting you to support... An agent will respond shortly.';
      await this.supportService.addBotMessage(conversationId, content, 'status');
      return { content, contentType: 'status', confidence: 1 };
    }

    const skill = this.skills.get(menuId);
    if (!skill) {
      const content = context.locale === 'ar' ? 'عذراً، هذه الميزة قيد التطوير.' : 'Sorry, this feature is coming soon.';
      return { content, contentType: 'text', confidence: 0.5 };
    }

    const response = await skill.handler(context, menuId);
    await this.supportService.addBotMessage(
      conversationId,
      response.content,
      response.contentType,
      response.metadata,
    );
    this.tracking.track('menu_click', conversationId, { menuId, confidence: response.confidence });
    return response;
  }

  /**
   * Get menu items filtered by user role.
   */
  getMenuItems(tradeRole: string): Array<{ id: string; name: string }> {
    return [...this.skills.values()]
      .filter((s) => s.menuItem && s.roleAccess.includes(tradeRole))
      .map((s) => ({ id: s.id, name: s.name }));
  }

  // ─── Skill Matching ────────────────────────────────────────────

  private matchSkill(message: string): BotSkill | undefined {
    const lower = message.toLowerCase().trim();
    for (const skill of this.skills.values()) {
      for (const trigger of skill.triggers) {
        if (lower.includes(trigger)) return skill;
      }
    }
    return undefined;
  }

  // ─── Built-in Skills ───────────────────────────────────────────

  private registerBuiltInSkills() {
    // Product Search
    this.skills.set('product_search', {
      id: 'product_search',
      name: 'Search Products',
      triggers: ['search', 'find', 'looking for', 'where can i', 'product'],
      menuItem: true,
      roleAccess: ['BUYER', 'COMPANY', 'FREELANCER', 'MEMBER'],
      handler: async (ctx, msg) => {
        if (msg === 'product_search') {
          const content = ctx.locale === 'ar' ? 'ماذا تبحث عنه؟' : 'What are you looking for?';
          return { content, contentType: 'text', confidence: 1 };
        }
        // Search products
        const term = msg.replace(/search|find|looking for|where can i|buy|get/gi, '').trim();
        if (!term) {
          return { content: ctx.locale === 'ar' ? 'ماذا تبحث عنه؟' : 'What are you looking for?', contentType: 'text', confidence: 1 };
        }
        const products = await this.prisma.product.findMany({
          where: {
            productName: { contains: term, mode: 'insensitive' },
            status: 'ACTIVE',
            deletedAt: null,
          },
          take: 3,
          select: { id: true, productName: true, productPrice: true, offerPrice: true },
        });
        if (products.length === 0) {
          return {
            content: ctx.locale === 'ar' ? `لم أجد نتائج لـ "${term}"` : `No products found for "${term}"`,
            contentType: 'navigate',
            metadata: { navigateTo: `/products?search=${encodeURIComponent(term)}`, label: ctx.locale === 'ar' ? 'بحث في المتجر' : 'Search in store' },
            confidence: 0.7,
          };
        }
        return {
          content: ctx.locale === 'ar' ? `وجدت ${products.length} منتجات:` : `Found ${products.length} products:`,
          contentType: 'cards',
          metadata: {
            cards: products.map((p) => ({
              title: p.productName,
              price: `${Number(p.offerPrice ?? p.productPrice)} OMR`,
              url: `/product/${p.id}`,
            })),
          },
          confidence: 0.9,
        };
      },
    });

    // Order Tracker
    this.skills.set('order_tracker', {
      id: 'order_tracker',
      name: 'Track Orders',
      triggers: ['order', 'track', 'delivery', 'shipped', 'where is my'],
      menuItem: true,
      roleAccess: ['BUYER', 'COMPANY', 'FREELANCER', 'MEMBER'],
      handler: async (ctx) => {
        const orders = await this.prisma.orderProducts.findMany({
          where: { userId: ctx.userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            orderNo: true,
            salePrice: true,
            orderProductStatus: true,
            orderProduct_product: { select: { productName: true } },
          },
        });
        if (orders.length === 0) {
          return {
            content: ctx.locale === 'ar' ? 'ليس لديك طلبات حالياً' : 'You have no orders yet',
            contentType: 'navigate',
            metadata: { navigateTo: '/products', label: ctx.locale === 'ar' ? 'تسوق الآن' : 'Shop now' },
            confidence: 1,
          };
        }
        return {
          content: ctx.locale === 'ar' ? 'طلباتك الأخيرة:' : 'Your recent orders:',
          contentType: 'cards',
          metadata: {
            cards: orders.map((o) => ({
              title: o.orderNo ?? `#${o.id}`,
              subtitle: o.orderProduct_product?.productName ?? '',
              price: `${Number(o.salePrice ?? 0)} OMR`,
              badge: o.orderProductStatus,
              url: '/orders',
            })),
          },
          confidence: 1,
        };
      },
    });

    // FAQ
    this.skills.set('faq', {
      id: 'faq',
      name: 'FAQ & Help',
      triggers: ['help', 'how do i', 'how to', 'policy', 'guide', 'faq'],
      menuItem: true,
      roleAccess: ['BUYER', 'COMPANY', 'FREELANCER', 'MEMBER'],
      handler: async (ctx, msg) => {
        if (msg === 'faq') {
          return {
            content: ctx.locale === 'ar' ? 'بماذا تحتاج مساعدة؟' : 'What do you need help with?',
            contentType: 'buttons',
            metadata: {
              buttons: [
                { label: 'Shipping', labelAr: 'الشحن', action: 'send_text', value: 'shipping info' },
                { label: 'Returns', labelAr: 'الإرجاع', action: 'send_text', value: 'return policy' },
                { label: 'Payments', labelAr: 'الدفع', action: 'send_text', value: 'payment methods' },
                { label: 'Seller Guide', labelAr: 'دليل البائع', action: 'navigate', value: '/help/seller-guide' },
                { label: 'Account', labelAr: 'الحساب', action: 'send_text', value: 'account help' },
              ],
            },
            confidence: 1,
          };
        }
        // Search knowledge base
        const articles = await this.prisma.knowledgeBase.findMany({
          where: {
            status: 'active',
            OR: [
              { title: { contains: msg, mode: 'insensitive' } },
              { content: { contains: msg, mode: 'insensitive' } },
              { tags: { hasSome: msg.split(' ').filter((w) => w.length > 2) } },
            ],
          },
          take: 3,
          select: { shortCode: true, title: true, content: true },
        });
        if (articles.length > 0) {
          const article = articles[0];
          // Return first match content (truncated) + link
          const shortContent = article.content.length > 200
            ? article.content.slice(0, 200) + '...'
            : article.content;
          return { content: shortContent, contentType: 'text', confidence: 0.8 };
        }
        return {
          content: ctx.locale === 'ar'
            ? 'لم أجد معلومات عن هذا الموضوع. هل تريد التحدث مع فريق الدعم؟'
            : "I don't have information on that topic. Would you like to talk to support?",
          contentType: 'buttons',
          metadata: {
            buttons: [
              { label: 'Talk to Admin', labelAr: 'تحدث مع الدعم', action: 'menu_click', value: 'escalate' },
              { label: 'Back to menu', labelAr: 'العودة للقائمة', action: 'menu_click', value: 'show_menu' },
            ],
          },
          confidence: 0.3,
        };
      },
    });

    // Escalate
    this.skills.set('escalate', {
      id: 'escalate',
      name: 'Talk to Admin',
      triggers: ['human', 'agent', 'admin', 'support', 'help me', 'speak to'],
      menuItem: true,
      roleAccess: ['BUYER', 'COMPANY', 'FREELANCER', 'MEMBER'],
      handler: async (ctx) => {
        // Escalation is handled by handleMenuClick
        return { content: '', contentType: 'status', confidence: 1 };
      },
    });
  }

  // ─── Overall Search ────────────────────────────────────────────

  private async overallSearch(query: string, ctx: BotContext): Promise<BotResponse> {
    const term = query.trim();
    if (term.length < 2) {
      return { content: '', contentType: 'text', confidence: 0 };
    }

    // Parallel search across multiple data sources
    const [products, orders, kb] = await Promise.all([
      this.prisma.product.findMany({
        where: { productName: { contains: term, mode: 'insensitive' }, status: 'ACTIVE', deletedAt: null },
        take: 3,
        select: { id: true, productName: true, offerPrice: true },
      }),
      this.prisma.orderProducts.findMany({
        where: { userId: ctx.userId, orderNo: { contains: term, mode: 'insensitive' } },
        take: 2,
        select: { id: true, orderNo: true, orderProductStatus: true },
      }),
      this.prisma.knowledgeBase.findMany({
        where: { status: 'active', OR: [{ title: { contains: term, mode: 'insensitive' } }, { content: { contains: term, mode: 'insensitive' } }] },
        take: 2,
        select: { shortCode: true, title: true },
      }),
    ]);

    const groups: any[] = [];
    if (products.length > 0) {
      groups.push({
        type: ctx.locale === 'ar' ? '📦 المنتجات' : '📦 Products',
        items: products.map((p) => ({
          title: p.productName,
          subtitle: `${Number(p.offerPrice ?? 0)} OMR`,
          url: `/product/${p.id}`,
        })),
      });
    }
    if (orders.length > 0) {
      groups.push({
        type: ctx.locale === 'ar' ? '📋 الطلبات' : '📋 Orders',
        items: orders.map((o) => ({
          title: o.orderNo ?? `#${o.id}`,
          subtitle: o.orderProductStatus,
          url: '/orders',
        })),
      });
    }
    if (kb.length > 0) {
      groups.push({
        type: ctx.locale === 'ar' ? '❓ مقالات المساعدة' : '❓ Help Articles',
        items: kb.map((a) => ({
          title: a.title,
          url: `/help/${a.shortCode}`,
        })),
      });
    }

    if (groups.length === 0) {
      return { content: '', contentType: 'text', confidence: 0 };
    }

    const totalResults = groups.reduce((s, g) => s + g.items.length, 0);
    return {
      content: ctx.locale === 'ar'
        ? `وجدت ${totalResults} نتيجة لـ "${term}":`
        : `Found ${totalResults} results for "${term}":`,
      contentType: 'search_results',
      metadata: { groups },
      confidence: 0.7,
    };
  }

  // ─── AI Fallback ───────────────────────────────────────────────

  private async aiFallback(message: string, ctx: BotContext): Promise<BotResponse> {
    const apiKey = this.config.get('OPENROUTER_API_KEY');
    const model = this.config.get('OPENROUTER_MODEL') || 'openai/gpt-3.5-turbo';

    if (!apiKey) {
      return {
        content: ctx.locale === 'ar'
          ? 'عذراً، لم أتمكن من فهم طلبك. يمكنك التحدث مع فريق الدعم.'
          : "Sorry, I couldn't understand your request. You can talk to our support team.",
        contentType: 'text',
        confidence: 0.2,
      };
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are Ultrasooq support bot. Rules:
- Answer in 1-2 sentences MAX
- Always suggest a page link or action if relevant
- If you don't know, say "Let me connect you with our support team"
- Respond in ${ctx.locale === 'ar' ? 'Arabic' : 'English'}
- You are a marketplace support bot, not a general AI assistant`,
            },
            { role: 'user', content: message },
          ],
          max_tokens: 100,
        }),
      });

      const data = await response.json();
      const aiContent = data?.choices?.[0]?.message?.content?.trim() ?? '';

      if (aiContent) {
        return { content: aiContent, contentType: 'text', confidence: 0.5 };
      }
    } catch (error) {
      this.logger.warn(`AI fallback error: ${error.message}`);
    }

    return {
      content: ctx.locale === 'ar'
        ? 'عذراً، حدث خطأ. يمكنك التحدث مع فريق الدعم.'
        : 'Sorry, something went wrong. You can talk to our support team.',
      contentType: 'text',
      confidence: 0.1,
    };
  }
}
