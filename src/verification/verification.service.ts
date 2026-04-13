/**
 * @module VerificationService
 * @description AI-powered CR document verification and company profile auto-fill.
 *
 * Pipeline:
 * 1. Takes CR document URL (PDF stored in S3)
 * 2. Sends to AI for extraction (company name, CR number, activities, branches)
 * 3. Auto-fills company profile fields
 * 4. Matches business activities to platform categories
 * 5. Suggests relevant products/services
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from '../helper/helper.service';
import { getErrorMessage } from '../common/utils/get-error-message';
import axios from 'axios';

// Extracted CR data structure
export interface CRExtractedData {
  companyName: string;
  companyNameAr?: string;
  crNumber: string;
  expiryDate?: string;
  issueDate?: string;
  address: string;
  city?: string;
  country?: string;
  businessActivities: string[];
  branches?: { name: string; address: string; city?: string }[];
  taxId?: string;
  capitalAmount?: string;
  legalForm?: string; // LLC, Sole Proprietorship, etc.
  ownerName?: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  confidence: number; // 0-100
}

export interface CategoryMatch {
  categoryId: number;
  categoryName: string;
  matchScore: number; // 0-100
  matchedActivity: string;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly openRouterApiKey: string;
  private readonly openRouterBaseUrl = 'https://openrouter.ai/api/v1';
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
  ) {
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.model = process.env.OPENROUTER_MODEL?.split(',')[0]?.trim() || 'qwen/qwen-2.5-72b-instruct';
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Extract data from CR document using AI
  // ═══════════════════════════════════════════════════════════

  async extractCRData(crDocumentUrl: string): Promise<CRExtractedData> {
    try {
      if (!this.openRouterApiKey) {
        throw new Error('OpenRouter API key not configured');
      }

      const prompt = `You are an expert document analyst specializing in Commercial Registration (CR) documents from the Middle East (Oman, UAE, Saudi Arabia, Bahrain, Kuwait, Qatar).

Analyze the CR document at this URL: ${crDocumentUrl}

Extract ALL of the following information. If a field is not found, set it to null.
Respond ONLY with valid JSON, no markdown or explanation.

{
  "companyName": "Company name in English",
  "companyNameAr": "Company name in Arabic if present",
  "crNumber": "CR/registration number",
  "expiryDate": "YYYY-MM-DD format",
  "issueDate": "YYYY-MM-DD format",
  "address": "Full registered address",
  "city": "City name",
  "country": "Country name",
  "businessActivities": ["List of business activities/categories mentioned"],
  "branches": [{"name": "Branch name", "address": "Branch address", "city": "City"}],
  "taxId": "Tax ID or VAT number if present",
  "capitalAmount": "Registered capital amount",
  "legalForm": "LLC, Sole Proprietorship, Partnership, etc.",
  "ownerName": "Owner or authorized signatory name",
  "phoneNumber": "Phone number if present",
  "email": "Email if present",
  "website": "Website if present",
  "confidence": 85
}`;

      const response = await axios.post(
        `${this.openRouterBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a document analysis AI. Always respond with valid JSON only. No markdown, no explanation, just JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content || '';

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }

      const extracted: CRExtractedData = JSON.parse(jsonStr);
      this.logger.log(`CR data extracted: ${extracted.companyName} (CR: ${extracted.crNumber}, confidence: ${extracted.confidence}%)`);

      return extracted;
    } catch (error) {
      this.logger.error('CR extraction failed', getErrorMessage(error));
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Auto-fill company profile from extracted data
  // ═══════════════════════════════════════════════════════════

  async autoFillProfile(userId: number, extractedData: CRExtractedData) {
    try {
      // Find or create user profile
      const profile = await this.prisma.userProfile.findFirst({
        where: { userId, deletedAt: null },
      });

      const updateData: any = {};

      if (extractedData.companyName) updateData.companyName = extractedData.companyName;
      if (extractedData.address) updateData.address = extractedData.address;
      if (extractedData.city) updateData.city = extractedData.city;
      if (extractedData.country) updateData.country = extractedData.country;
      if (extractedData.phoneNumber) updateData.phoneNumber = extractedData.phoneNumber;

      // Update user fields too
      if (extractedData.taxId || extractedData.website) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            ...(extractedData.taxId ? { companyTaxId: extractedData.taxId } : {}),
            ...(extractedData.website ? { companyWebsite: extractedData.website } : {}),
            ...(extractedData.companyName ? { companyName: extractedData.companyName } : {}),
            ...(extractedData.address ? { companyAddress: extractedData.address } : {}),
            ...(extractedData.phoneNumber ? { companyPhone: extractedData.phoneNumber } : {}),
          },
        });
      }

      if (profile) {
        await this.prisma.userProfile.update({
          where: { id: profile.id },
          data: updateData,
        });
      }

      this.logger.log(`Profile auto-filled for user ${userId}: ${extractedData.companyName}`);

      return { status: true, message: 'Profile auto-filled', fieldsUpdated: Object.keys(updateData) };
    } catch (error) {
      this.logger.error('Auto-fill failed', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Find & create branches from CR data
  // ═══════════════════════════════════════════════════════════

  async createBranchesFromCR(userId: number, extractedData: CRExtractedData) {
    try {
      const branches = extractedData.branches || [];
      if (branches.length === 0) {
        // Use main address as a single branch
        branches.push({
          name: 'Main Office',
          address: extractedData.address,
          city: extractedData.city,
        });
      }

      const createdBranches: any[] = [];
      for (const branch of branches) {
        const existing = await this.prisma.userBranch.findFirst({
          where: {
            userId,
            address: branch.address,
            deletedAt: null,
          },
        });

        if (!existing) {
          const created = await this.prisma.userBranch.create({
            data: {
              userId,
              address: branch.address || '',
              city: branch.city || '',
              mainOffice: createdBranches.length === 0 ? 1 : 0,
              status: 'ACTIVE',
            } as any,
          });
          createdBranches.push(created);
        }
      }

      this.logger.log(`Created ${createdBranches.length} branches for user ${userId}`);
      return { status: true, branchesCreated: createdBranches.length, branches: createdBranches };
    } catch (error) {
      this.logger.error('Branch creation failed', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Match business activities to platform categories
  // ═══════════════════════════════════════════════════════════

  async matchCategories(businessActivities: string[]): Promise<CategoryMatch[]> {
    try {
      if (!businessActivities.length) return [];

      // Get all active categories from the platform
      const categories = await this.prisma.category.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true, parentId: true },
        take: 500,
      });

      if (!this.openRouterApiKey || categories.length === 0) return [];

      const prompt = `Given these business activities from a Commercial Registration document:
${JSON.stringify(businessActivities)}

And these platform categories:
${JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name })))}

Match each business activity to the most relevant platform categories.
Return ONLY valid JSON array:
[{"categoryId": 123, "categoryName": "Electronics", "matchScore": 85, "matchedActivity": "Trading in electronic devices"}]

Only include matches with score >= 60. Max 10 matches.`;

      const response = await axios.post(
        `${this.openRouterBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: 'Respond with valid JSON array only. No explanation.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content || '[]';
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }

      const matches: CategoryMatch[] = JSON.parse(jsonStr);
      this.logger.log(`Matched ${matches.length} categories for ${businessActivities.length} activities`);
      return matches;
    } catch (error) {
      this.logger.error('Category matching failed', getErrorMessage(error));
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Assign matched categories to user
  // ═══════════════════════════════════════════════════════════

  async assignCategories(userId: number, matches: CategoryMatch[]) {
    try {
      const assigned: number[] = [];
      for (const match of matches) {
        const existing = await this.prisma.userBusinessCategory.findFirst({
          where: { userId, categoryId: match.categoryId },
        });
        if (!existing) {
          await this.prisma.userBusinessCategory.create({
            data: { userId, categoryId: match.categoryId },
          });
          assigned.push(match.categoryId);
        }
      }
      this.logger.log(`Assigned ${assigned.length} categories to user ${userId}`);
      return { status: true, categoriesAssigned: assigned.length, categoryIds: assigned };
    } catch (error) {
      this.logger.error('Category assignment failed', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error) };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 6: Suggest products/services based on matched categories
  // ═══════════════════════════════════════════════════════════

  async suggestProducts(categoryIds: number[], limit = 10) {
    try {
      if (!categoryIds.length) return [];

      const products = await this.prisma.product.findMany({
        where: {
          categoryId: { in: categoryIds },
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          productName: true,
          categoryId: true,
          productPrice: true,
          offerPrice: true,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return products;
    } catch (error) {
      this.logger.error('Product suggestion failed', getErrorMessage(error));
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FULL PIPELINE: Extract → Fill → Branch → Match → Assign
  // ═══════════════════════════════════════════════════════════

  async runFullPipeline(userId: number, crDocumentUrl: string) {
    const results: any = {
      extraction: null,
      profileFill: null,
      branches: null,
      categoryMatches: null,
      categoryAssignment: null,
      suggestedProducts: null,
    };

    try {
      // Step 1: Extract
      this.logger.log(`Starting CR pipeline for user ${userId}`);
      const extracted = await this.extractCRData(crDocumentUrl);
      results.extraction = extracted;

      // Step 2: Auto-fill profile
      results.profileFill = await this.autoFillProfile(userId, extracted);

      // Step 3: Create branches
      results.branches = await this.createBranchesFromCR(userId, extracted);

      // Step 4: Match categories
      const matches = await this.matchCategories(extracted.businessActivities);
      results.categoryMatches = matches;

      // Step 5: Assign categories
      if (matches.length > 0) {
        results.categoryAssignment = await this.assignCategories(userId, matches);
      }

      // Step 6: Suggest products
      const matchedCategoryIds = matches.map((m) => m.categoryId);
      if (matchedCategoryIds.length > 0) {
        results.suggestedProducts = await this.suggestProducts(matchedCategoryIds);
      }

      this.logger.log(`CR pipeline completed for user ${userId}: ${extracted.companyName}`);

      return {
        status: true,
        message: `CR verified: ${extracted.companyName} (confidence: ${extracted.confidence}%)`,
        data: results,
      };
    } catch (error) {
      this.logger.error(`CR pipeline failed for user ${userId}`, getErrorMessage(error));
      return {
        status: false,
        message: getErrorMessage(error),
        data: results,
      };
    }
  }
}
