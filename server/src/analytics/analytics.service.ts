import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Analytics, AnalyticsDocument } from './schemas/analytics.schema';
import { AnalyticsFeedbackService } from './analytics-feedback.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Analytics.name)
    private readonly analyticsModel: Model<AnalyticsDocument>,
    private readonly analyticsFeedback: AnalyticsFeedbackService,
  ) {}

  /** Example hook — call after weekly pull aggregates are persisted. */
  async runFeedbackPass(metricsSummary: string): Promise<unknown> {
    return this.analyticsFeedback.generateSuggestions(metricsSummary);
  }
}
