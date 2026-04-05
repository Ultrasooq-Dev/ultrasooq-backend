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
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
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
  ],
})
export class SearchIntelligenceModule {}
