import { Module } from '@nestjs/common';
import { QueryParserService } from './services/query-parser.service';
import { IntentClassifierService } from './services/intent-classifier.service';
import { CategoryIndexService } from './services/category-index.service';

@Module({
  providers: [
    QueryParserService,
    IntentClassifierService,
    CategoryIndexService,
  ],
  exports: [
    QueryParserService,
    IntentClassifierService,
    CategoryIndexService,
  ],
})
export class SearchIntelligenceModule {}
