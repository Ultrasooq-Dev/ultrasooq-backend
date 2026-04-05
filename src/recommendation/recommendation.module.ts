import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationAdminController } from './recommendation-admin.controller';
import { RecommendationService } from './services/recommendation.service';
import { RecommendationRedisService } from './services/recommendation-redis.service';
import { ProfileBuilderService } from './services/profile-builder.service';
import { TrendingService } from './services/trending.service';
import { SimilarityService } from './services/similarity.service';
import { FeedbackService } from './services/feedback.service';
import { FeedbackStatsService } from './services/feedback-stats.service';
import { CollaborativeService } from './services/collaborative.service';
import { PersonalRecommendationService } from './services/personal.service';
import { SearchBoostService } from './services/search-boost.service';
import { CrossSellService } from './services/crosssell.service';
import { FlowNudgeService } from './services/flow-nudge.service';
import { SelfTuneService } from './services/self-tune.service';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../guards/AuthGuard';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';

@Module({
  imports: [AuthModule],
  controllers: [RecommendationController, RecommendationAdminController],
  providers: [
    RecommendationRedisService,
    RecommendationService,
    ProfileBuilderService,
    TrendingService,
    SimilarityService,
    FeedbackService,
    FeedbackStatsService,
    CollaborativeService,
    PersonalRecommendationService,
    SearchBoostService,
    CrossSellService,
    FlowNudgeService,
    SelfTuneService,
    AuthGuard,
    SuperAdminAuthGuard,
  ],
  exports: [RecommendationService, RecommendationRedisService, SearchBoostService],
})
export class RecommendationModule {}
