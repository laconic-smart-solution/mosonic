import {
  BadRequestException,
  forwardRef,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AnalyticsService } from '../analytics/analytics.service';
import { EventsService } from '../events/events.service';
import type { ExtractRuleResponseDto } from './dto/extract-rule.dto';
import type { RuleExtractRequest } from './extract-request.types';
import type { ReplaceRuleDto } from './dto/replace-rule.dto';
import type { RulePageQueryDto } from './dto/rule-page-query.dto';
import type { RulePageItemDto } from './dto/rule-page-query.dto';
import type { CampaignDto } from './dto/rule-body.dto';
import type { UpdateRuleDto } from './dto/update-rule.dto';
import type {
  NewsTriggerSettingsResponseDto,
  UpdateNewsTriggerSettingsDto,
} from './dto/news-trigger-settings.dto';
import {
  GenderOption,
  NewsTriggerCategory,
  NewsTriggerConfig,
  NewsTriggerSchedule,
  OriginalInputType,
  PostingFrequency,
  Rule,
  type RuleDocument,
  RuleStatus,
  VersionChangedBy,
} from './schemas/rule.schema';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { ContentReaderService } from '../preprocessing/content-reader.service';
import { PreprocessingService } from '../preprocessing/preprocessing.service';
import { RuleExtractionService } from './rule-extraction.service';
import { buildSuggestionUpdateDto } from './rule-suggestion-field-patch.util';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function httpExceptionMessage(e: unknown): string | undefined {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    if (typeof r === 'string') return r;
    if (typeof r === 'object' && r && 'message' in r) {
      const m = (r as { message: string | string[] }).message;
      return Array.isArray(m) ? m.join('; ') : String(m);
    }
  }
  return undefined;
}

type RulePageRaw = {
  ruleId?: string;
  name?: string;
  status?: RuleStatus;
  brand?: { brandTone?: string[] };
  channels?: Array<{ channel?: string }>;
  updatedAt?: Date | string;
};

@Injectable()
export class RuleService {
  private readonly logger = new Logger(RuleService.name);
  private static readonly DEFAULT_AWAIT_TIMEOUT_MS = 120_000;

  constructor(
    @InjectModel(Rule.name) private readonly ruleModel: Model<RuleDocument>,
    private readonly ruleExtraction: RuleExtractionService,
    private readonly preprocessing: PreprocessingService,
    private readonly contentReader: ContentReaderService,
    private readonly events: EventsService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
  ) {}

  async requestExtraction(
    args: RuleExtractRequest,
    auth: TenancyAuth,
  ): Promise<ExtractRuleResponseDto> {
    const now = new Date();
    const originalType =
      args.files.length > 0
        ? OriginalInputType.File
        : args.urls.length > 0
          ? OriginalInputType.Url
          : OriginalInputType.Text;

    const ruleId = randomUUID();

    await this.ruleModel.create({
      ruleId,
      userId: auth.userId,
      name: 'Processing rule',
      brand: {
        brandName: 'Pending',
        industry: 'Unknown',
        brandDescription: 'Pending extraction',
        brandTone: [],
        brandVoice: 'Pending extraction',
        brandRestrictions: [],
        callToAction: 'Learn more',
      },
      audience: {
        description: 'Pending extraction',
        ageRange: { min: 18, max: 65 },
        gender: GenderOption.All,
        location: [],
        interests: [],
        painPoints: [],
        language: 'en',
        targetLanguages: ['en'],
      },
      campaign: {
        goals: [],
        keywords: [],
        hashtagStrategy: [],
        contentFormats: [],
        duration: { startDate: now, endDate: now },
        postingFrequency: PostingFrequency.Weekly,
        customSchedule: [],
      },
      channels: [],
      contentGuidelines: {
        dos: [],
        donts: [],
        requiredElements: [],
        seoGuidelines: {
          primaryKeywords: [],
          secondaryKeywords: [],
          keywordDensity: 'natural, not forced',
        },
      },
      originalInput: {
        type: originalType,
        storedAt:
          originalType === OriginalInputType.File
            ? `multipart://${ruleId}`
            : originalType === OriginalInputType.Url
              ? `urls://${args.urls.length}`
              : `inline://${now.getTime()}`,
      },
      status: RuleStatus.Processing,
      versions: [],
    });

    try {
      await this.analyticsService.ensureForRule(ruleId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to seed analytics doc for rule ${ruleId}: ${msg}`,
      );
    }

    void this.runExtraction(ruleId, args, auth);
    return { ruleId };
  }

  /**
   * Start extraction from a plain prompt and wait until the rule is active.
   * Used by workflow generation when no rule is preselected.
   */
  async extractAndAwaitReady(
    contentPrompt: string,
    auth: TenancyAuth,
  ): Promise<string> {
    const prompt = contentPrompt.trim();
    if (!prompt) {
      throw new BadRequestException('contentPrompt must not be empty');
    }
    const { ruleId } = await this.requestExtraction(
      {
        input: prompt,
        files: [],
        urls: [],
      },
      auth,
    );
    await this.awaitRuleReady(ruleId, auth);
    return ruleId;
  }

  async awaitRuleReady(
    ruleId: string,
    auth: TenancyAuth,
    timeoutMs = RuleService.DEFAULT_AWAIT_TIMEOUT_MS,
  ): Promise<void> {
    const startedAt = Date.now();
    const intervalMs = 500;
    for (;;) {
      const rule = await this.ruleModel
        .findOne(mergeUserIdFilter({ ruleId }, auth))
        .lean()
        .exec();
      if (!rule) {
        throw new NotFoundException(`Rule ${ruleId} not found`);
      }
      if (rule.status === RuleStatus.Active) return;
      if (rule.status === RuleStatus.Failed) {
        throw new BadRequestException(`Rule extraction failed for ${ruleId}`);
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new BadRequestException(
          `Timed out waiting for rule extraction (${ruleId})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async getRuleById(ruleId: string, auth: TenancyAuth): Promise<RuleDocument> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
    return rule;
  }

  private campaignFromDto(dto: CampaignDto) {
    return {
      goals: dto.goals,
      keywords: dto.keywords,
      hashtagStrategy: dto.hashtagStrategy,
      contentFormats: dto.contentFormats,
      duration: {
        startDate: new Date(dto.duration.startDate),
        endDate: new Date(dto.duration.endDate),
      },
      postingFrequency: dto.postingFrequency,
      customSchedule: dto.customSchedule,
    };
  }

  /** Apply a single analytics suggestion field to the rule (merged PATCH). */
  async applySuggestionFieldPatch(
    ruleId: string,
    fieldPath: string,
    suggestedValue: unknown,
    auth: TenancyAuth,
  ): Promise<RuleDocument> {
    const existing = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!existing) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
    const dto = buildSuggestionUpdateDto(
      {
        brand: existing.brand,
        campaign: existing.campaign,
        channels: existing.channels,
      },
      fieldPath,
      suggestedValue,
    );
    return this.patchRule(ruleId, dto, auth);
  }

  async patchRule(
    ruleId: string,
    dto: UpdateRuleDto,
    auth: TenancyAuth,
  ): Promise<RuleDocument> {
    const existing = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!existing) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const $set: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      $set.name = dto.name;
    }

    if (dto.brand !== undefined) {
      $set.brand = { ...existing.brand, ...dto.brand };
    }

    if (dto.audience !== undefined) {
      $set.audience = {
        ...existing.audience,
        ...dto.audience,
        ageRange:
          dto.audience.ageRange !== undefined
            ? {
                ...existing.audience.ageRange,
                ...dto.audience.ageRange,
              }
            : existing.audience.ageRange,
      };
    }

    if (dto.campaign !== undefined) {
      const ex = existing.campaign;
      const mergedCampaign = {
        ...ex,
        ...dto.campaign,
        duration:
          dto.campaign.duration !== undefined
            ? {
                startDate:
                  dto.campaign.duration.startDate ?? ex.duration.startDate,
                endDate: dto.campaign.duration.endDate ?? ex.duration.endDate,
              }
            : ex.duration,
      };
      $set.campaign = this.campaignFromDto(mergedCampaign as CampaignDto);
    }

    if (dto.channels !== undefined) {
      $set.channels = dto.channels;
    }

    if (dto.contentGuidelines !== undefined) {
      const ex = existing.contentGuidelines;
      $set.contentGuidelines = {
        ...ex,
        ...dto.contentGuidelines,
        seoGuidelines:
          dto.contentGuidelines.seoGuidelines !== undefined
            ? {
                ...ex.seoGuidelines,
                ...dto.contentGuidelines.seoGuidelines,
              }
            : ex.seoGuidelines,
      };
    }

    if (Object.keys($set).length === 0) {
      throw new BadRequestException(
        'No updatable fields in body (send at least one of: name, brand, audience, campaign, channels, contentGuidelines)',
      );
    }

    const updated = await this.ruleModel
      .findOneAndUpdate(
        mergeUserIdFilter({ ruleId }, auth),
        { $set },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
    return updated;
  }

  async replaceRule(
    ruleId: string,
    dto: ReplaceRuleDto,
    auth: TenancyAuth,
  ): Promise<RuleDocument> {
    const $set = {
      name: dto.name,
      brand: dto.brand,
      audience: dto.audience,
      campaign: this.campaignFromDto(dto.campaign),
      channels: dto.channels,
      contentGuidelines: dto.contentGuidelines,
    };

    const updated = await this.ruleModel
      .findOneAndUpdate(
        mergeUserIdFilter({ ruleId }, auth),
        { $set },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
    return updated;
  }

  async findPage(
    dto: RulePageQueryDto,
    auth: TenancyAuth,
  ): Promise<{
    data: RulePageItemDto[];
    total: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const sortBy = dto.sortBy ?? 'updatedAt';
    const sortOrder = dto.sortOrder ?? 'desc';
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = mergeUserIdFilter({}, auth);
    const nameFilter = dto.filter?.name?.trim();
    if (nameFilter) {
      filter.name = {
        $regex: escapeRegex(nameFilter),
        $options: 'i',
      };
    }
    if (dto.filter?.status !== undefined) {
      filter.status = dto.filter.status;
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortDir };

    const [data, total] = await Promise.all([
      this.ruleModel
        .find(filter)
        .select({
          ruleId: 1,
          name: 1,
          status: 1,
          'brand.brandTone': 1,
          'channels.channel': 1,
          updatedAt: 1,
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.ruleModel.countDocuments(filter).exec(),
    ]);

    const mapped: RulePageItemDto[] = (data as unknown as RulePageRaw[]).map(
      (row) => {
        const channels = Array.isArray(row.channels)
          ? row.channels
              .map((c) => c.channel?.trim())
              .filter((c): c is string => Boolean(c))
          : [];
        const updatedAtRaw = row.updatedAt;
        const updatedAt =
          updatedAtRaw instanceof Date
            ? updatedAtRaw.toISOString()
            : typeof updatedAtRaw === 'string'
              ? updatedAtRaw
              : new Date().toISOString();
        return {
          ruleId: typeof row.ruleId === 'string' ? row.ruleId : '',
          name: typeof row.name === 'string' ? row.name : '',
          status: row.status ?? RuleStatus.Processing,
          tones: Array.isArray(row.brand?.brandTone) ? row.brand.brandTone : [],
          channels,
          updatedAt,
        };
      },
    );

    return { data: mapped, total };
  }

  private async runExtraction(
    ruleId: string,
    args: RuleExtractRequest,
    auth: TenancyAuth,
  ): Promise<void> {
    try {
      this.events.emitToRule(ruleId, 'rule:started', { ruleId });

      this.events.emitToRule(ruleId, 'rule:reading_input', {
        ruleId,
        message: 'Reading your input...',
      });

      const payload = await this.preprocessing.resolvePayload({
        userText: args.input,
        files: args.files,
        urls: args.urls,
      });

      const hasAnyContent =
        payload.userText.trim().length > 0 ||
        payload.chunks.some((c) =>
          c.kind === 'text' ? c.text.trim().length > 0 : c.base64.length > 0,
        );

      if (!hasAnyContent) {
        throw new BadRequestException(
          'No readable content could be produced from your inputs',
        );
      }

      const summary = await this.contentReader.summarize(payload);
      if (!summary.trim()) {
        throw new BadRequestException(
          'Could not summarize your inputs into usable strategy content',
        );
      }

      this.events.emitToRule(ruleId, 'rule:input_processed', {
        ruleId,
        message: 'Analyzing your strategy...',
      });

      const extracted = await this.ruleExtraction.extractRuleFromInput(summary);
      const streamSource = JSON.stringify(extracted);
      for (const chunk of streamSource.split(/\s+/).filter(Boolean)) {
        this.events.emitToRule(ruleId, 'rule:streaming', { ruleId, chunk });
      }

      await this.ruleModel.updateOne(
        mergeUserIdFilter({ ruleId }, auth),
        {
          $set: {
            name: extracted.name,
            brand: extracted.brand,
            audience: extracted.audience,
            campaign: {
              ...extracted.campaign,
              duration: {
                startDate: new Date(extracted.campaign.duration.startDate),
                endDate: new Date(extracted.campaign.duration.endDate),
              },
            },
            channels: extracted.channels,
            contentGuidelines: extracted.contentGuidelines,
            status: RuleStatus.Active,
          },
          $push: {
            versions: {
              versionNumber: 1,
              changedFields: ['*'],
              changedBy: VersionChangedBy.SystemSuggestion,
              snapshot: extracted,
              createdAt: new Date(),
            },
          },
        },
      );

      this.events.emitToRule(ruleId, 'rule:completed', { ruleId });
    } catch (error) {
      this.logger.error(`Rule extraction failed for ${ruleId}`, error as Error);
      await this.ruleModel.updateOne(
        mergeUserIdFilter({ ruleId }, auth),
        { $set: { status: RuleStatus.Failed } },
      );
      const message =
        error instanceof BadRequestException
          ? (httpExceptionMessage(error) ?? 'Rule generation failed')
          : 'Rule generation failed';
      this.events.emitToRule(ruleId, 'rule:failed', {
        ruleId,
        message,
      });
    }
  }

  private defaultNewsTrigger(): NewsTriggerConfig {
    return {
      enabled: false,
      schedule: NewsTriggerSchedule.Daily,
      country: 'us',
      language: 'en',
      category: NewsTriggerCategory.Business,
      keywords: [],
      minRelevanceScore: 70,
      maxPostsPerDay: 1,
      autoApprove: false,
      lastTriggeredAt: null,
      totalTriggeredCount: 0,
    };
  }

  private toNewsTriggerResponse(
    nt: NewsTriggerConfig | undefined,
  ): NewsTriggerSettingsResponseDto {
    const base = nt ?? this.defaultNewsTrigger();
    return {
      enabled: base.enabled ?? false,
      schedule: base.schedule ?? NewsTriggerSchedule.Daily,
      country: base.country ?? 'us',
      language: base.language ?? 'en',
      category: base.category ?? NewsTriggerCategory.Business,
      keywords: (base.keywords ?? []).map((k) => k.toLowerCase()),
      minRelevanceScore: base.minRelevanceScore ?? 70,
      maxPostsPerDay: base.maxPostsPerDay ?? 1,
      autoApprove: base.autoApprove ?? false,
      lastTriggeredAt: base.lastTriggeredAt
        ? new Date(base.lastTriggeredAt).toISOString()
        : null,
      totalTriggeredCount: base.totalTriggeredCount ?? 0,
    };
  }

  async getNewsTriggerSettings(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<NewsTriggerSettingsResponseDto> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
    return this.toNewsTriggerResponse(rule.newsTrigger);
  }

  async updateNewsTriggerSettings(
    ruleId: string,
    body: UpdateNewsTriggerSettingsDto,
    auth: TenancyAuth,
  ): Promise<NewsTriggerSettingsResponseDto> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const existing = rule.newsTrigger
      ? (JSON.parse(JSON.stringify(rule.newsTrigger)) as NewsTriggerConfig)
      : {};
    const current: NewsTriggerConfig = {
      ...this.defaultNewsTrigger(),
      ...existing,
    };

    if (body.enabled !== undefined) current.enabled = body.enabled;
    if (body.schedule !== undefined) current.schedule = body.schedule;
    if (body.country !== undefined) current.country = body.country.trim();
    if (body.language !== undefined) current.language = body.language.trim();
    if (body.category !== undefined) current.category = body.category;
    if (body.keywords !== undefined) {
      current.keywords = body.keywords
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);
    }
    if (body.minRelevanceScore !== undefined) {
      current.minRelevanceScore = body.minRelevanceScore;
    }
    if (body.maxPostsPerDay !== undefined) {
      current.maxPostsPerDay = body.maxPostsPerDay;
    }
    if (body.autoApprove !== undefined) current.autoApprove = body.autoApprove;

    rule.newsTrigger = current;
    await rule.save();

    return this.toNewsTriggerResponse(rule.newsTrigger);
  }
}
