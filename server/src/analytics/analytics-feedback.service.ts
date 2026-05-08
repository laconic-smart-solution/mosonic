import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class AnalyticsFeedbackService {
  constructor(private readonly llm: LlmService) {}

  /** Called after a weekly analytics pull completes; suggestions feed back into Rule. */
  async generateSuggestions(_metricsSummary: string): Promise<unknown> {
    void this.llm;
    return Promise.resolve(null);
  }
}
