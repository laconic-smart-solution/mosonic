import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmModule } from '../llm/llm.module';
import { AnalyticsFeedbackService } from './analytics-feedback.service';
import { AnalyticsService } from './analytics.service';
import { Analytics, AnalyticsSchema } from './schemas/analytics.schema';

@Module({
  imports: [
    LlmModule,
    MongooseModule.forFeature([
      { name: Analytics.name, schema: AnalyticsSchema },
    ]),
  ],
  providers: [AnalyticsService, AnalyticsFeedbackService],
  exports: [MongooseModule, AnalyticsService, AnalyticsFeedbackService],
})
export class AnalyticsModule {}
