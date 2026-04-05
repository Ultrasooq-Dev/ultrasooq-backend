import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './services/recommendation.service';
import { RecommendationRedisService } from './services/recommendation-redis.service';
import { ProfileBuilderService } from './services/profile-builder.service';
import { TrendingService } from './services/trending.service';
import { SimilarityService } from './services/similarity.service';
import { FeedbackService } from './services/feedback.service';
import { CollaborativeService } from './services/collaborative.service';
import { PersonalRecommendationService } from './services/personal.service';
import { SearchBoostService } from './services/search-boost.service';
import { CrossSellService } from './services/crosssell.service';

@Module({
  controllers: [RecommendationController],
  providers: [
    RecommendationRedisService,
    RecommendationService,
    ProfileBuilderService,
    TrendingService,
    SimilarityService,
    FeedbackService,
    CollaborativeService,
    PersonalRecommendationService,
    SearchBoostService,
    CrossSellService,
  ],
  exports: [RecommendationService, RecommendationRedisService, SearchBoostService],
})
export class RecommendationModule {}
