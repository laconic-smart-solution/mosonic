import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User, UserRole } from '../users/schemas/user.schema';
import { AnalyticsPageQueryDto } from './dto/analytics-page-query.dto';
import type {
  AnalyticsListResponseDto,
  AnalyticsLatestResponseDto,
  AnalyticsSnapshotDto,
} from './dto/analytics-response.dto';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsDocument } from './schemas/analytics.schema';

function toSnapshotDto(doc: AnalyticsDocument): AnalyticsSnapshotDto {
  const created = (doc as unknown as { createdAt?: Date }).createdAt;
  return {
    analyticsId: doc.analyticsId,
    ruleRef: doc.ruleRef,
    period: {
      from: doc.period.from,
      to: doc.period.to,
    },
    pulledAt: doc.pulledAt.toISOString(),
    contentPerformance: doc.contentPerformance,
    campaignSummary: doc.campaignSummary,
    feedbackSignal: doc.feedbackSignal,
    createdAt: created instanceof Date ? created.toISOString() : undefined,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('analytics')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsRepository: AnalyticsRepository,
  ) {}

  @Get()
  async list(
    @Query() query: AnalyticsPageQueryDto,
    @Req() req: Request,
  ): Promise<AnalyticsListResponseDto> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { items, total } = await this.analyticsRepository.listForRules(
      auth,
      { page, limit, ruleId: query.ruleId },
    );

    const totalPendingSuggestions =
      auth.role === UserRole.ADMIN
        ? await this.analyticsRepository.countPendingSuggestionsAll()
        : await this.analyticsRepository.countPendingSuggestionsForRules(
            auth,
          );

    const analytics = await Promise.all(
      items.map(async (doc) => {
        const ruleName =
          (await this.analyticsRepository.getRuleName(doc.ruleRef, auth)) ??
          doc.ruleRef;
        return {
          ruleRef: doc.ruleRef,
          ruleName,
          latest: toSnapshotDto(doc),
          pendingSuggestionCount:
            this.analyticsRepository.pendingCountOnDoc(doc),
        };
      }),
    );

    return {
      analytics,
      total,
      totalPendingSuggestions,
      page,
      limit,
    };
  }

  /** Static path before `:analyticsId` — order matters. */
  @Get('latest/:ruleId')
  async latest(
    @Param('ruleId') ruleId: string,
    @Req() req: Request,
  ): Promise<AnalyticsLatestResponseDto> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    const allowed = await this.analyticsRepository.assertUserOwnsRule(
      ruleId,
      auth,
    );
    if (!allowed) {
      throw new NotFoundException('Rule not found');
    }

    const enriched = await this.analyticsService.latestWithDisplay(ruleId, auth);
    return {
      ruleName: enriched.ruleName,
      analytics: enriched.analytics ? toSnapshotDto(enriched.analytics) : null,
      display: enriched.display,
    };
  }

  @Get(':analyticsId')
  async getOne(
    @Param('analyticsId') analyticsId: string,
    @Req() req: Request,
  ): Promise<{ analytics: AnalyticsSnapshotDto }> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    const doc = await this.analyticsRepository.findByAnalyticsId(analyticsId);
    if (!doc) {
      throw new NotFoundException('Analytics not found');
    }
    const owns = await this.analyticsRepository.assertUserOwnsRule(
      doc.ruleRef,
      auth,
    );
    if (!owns) {
      throw new NotFoundException('Analytics not found');
    }
    return { analytics: toSnapshotDto(doc) };
  }

  @Post('pull/:ruleId')
  async pull(
    @Param('ruleId') ruleId: string,
    @Req() req: Request,
  ): Promise<{ analyticsId: string }> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    return this.analyticsService.manualPull(ruleId, auth);
  }

  @Post(':analyticsId/suggestions/generate')
  async generateSuggestions(
    @Param('analyticsId') analyticsId: string,
    @Req() req: Request,
  ): Promise<{ analyticsId: string; suggestionCount: number }> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    return this.analyticsService.generateSuggestions(analyticsId, auth);
  }

  @Post(':analyticsId/suggestions/:index/apply')
  async apply(
    @Param('analyticsId') analyticsId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    await this.analyticsService.applySuggestion(analyticsId, index, auth);
    return { success: true };
  }

  @Post(':analyticsId/suggestions/:index/reject')
  async reject(
    @Param('analyticsId') analyticsId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    await this.analyticsService.rejectSuggestion(analyticsId, index, auth);
    return { success: true };
  }
}
