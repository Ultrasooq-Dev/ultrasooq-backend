import { Module } from '@nestjs/common';
import { QueryParserService } from './services/query-parser.service';
import { IntentClassifierService } from './services/intent-classifier.service';
import { CategoryIndexService } from './services/category-index.service';
import { AttributeExtractorService } from './services/attribute-extractor.service';
import { SearchTokensBuilderService } from './services/search-tokens-builder.service';
import { BrandResolverService } from './services/brand-resolver.service';
import { KnowledgeGraphService } from './services/knowledge-graph.service';
import { RankFusionService } from './services/rank-fusion.service';
import { DidYouMeanService } from './services/did-you-mean.service';
import { SearchMiningService } from './services/search-mining.service';
import { NaturalLanguageRewriterService } from './services/natural-language-rewriter.service';
import { DisambiguationService } from './services/disambiguation.service';
import { SearchAnalyticsService } from './services/search-analytics.service';
import { SearchAdminController } from './search-admin.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SearchAdminController],
  providers: [
    QueryParserService,
    IntentClassifierService,
    CategoryIndexService,
    AttributeExtractorService,
    SearchTokensBuilderService,
    BrandResolverService,
    KnowledgeGraphService,
    RankFusionService,
    DidYouMeanService,
    SearchMiningService,
    NaturalLanguageRewriterService,
    DisambiguationService,
    SearchAnalyticsService,
  ],
  exports: [
    QueryParserService,
    IntentClassifierService,
    CategoryIndexService,
    AttributeExtractorService,
    SearchTokensBuilderService,
    BrandResolverService,
    KnowledgeGraphService,
    RankFusionService,
    DidYouMeanService,
    SearchMiningService,
    NaturalLanguageRewriterService,
    DisambiguationService,
    SearchAnalyticsService,
  ],
})
export class SearchIntelligenceModule {}
