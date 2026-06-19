import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentStatus, Prisma } from '@prisma/client';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { ICostEntryRepository } from '../../repositories/interfaces/cost-entry.repository.interface';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { IRuleRepository } from '../../repositories/interfaces/rule.repository.interface';
import type { IUserRepository } from '../../repositories/interfaces/user.repository.interface';
import {
  CONTENT_REPOSITORY,
  COST_ENTRY_REPOSITORY,
  PIPELINE_REPOSITORY,
  RULE_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';

function displayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): string {
  const parts = [u.firstName, u.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.join(' ');
  return u.username ?? '';
}

function contentPreview(content: {
  userEdits?: unknown;
  outputs?: unknown;
}): string | undefined {
  const userEdits = content.userEdits as
    | { text?: string; translatedText?: string }
    | null
    | undefined;
  const outputs = content.outputs as
    | { text?: string; translatedText?: string }
    | null
    | undefined;
  const text =
    userEdits?.text ??
    outputs?.text ??
    userEdits?.translatedText ??
    outputs?.translatedText;
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}

function ruleChannelNames(rule: { channels: unknown }): string[] {
  if (!Array.isArray(rule.channels)) return [];
  return (rule.channels as Array<{ channel?: string }>)
    .map((x) => x.channel)
    .filter((c): c is string => Boolean(c));
}

@Injectable()
export class AdminContentService {
  constructor(
    @Inject(CONTENT_REPOSITORY) private readonly content: IContentRepository,
    @Inject(PIPELINE_REPOSITORY) private readonly pipelines: IPipelineRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(COST_ENTRY_REPOSITORY)
    private readonly costEntries: ICostEntryRepository,
    @Inject(RULE_REPOSITORY) private readonly rules: IRuleRepository,
  ) {}

  async listContent(query: {
    page: number;
    limit: number;
    status?: string;
    userId?: string;
    from?: Date;
    to?: Date;
  }) {
    const { page, limit } = query;

    const filter: Prisma.ContentWhereInput = {};
    if (query.status) filter.status = query.status as ContentStatus;
    if (query.userId) filter.userId = query.userId;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.gte = query.from;
      if (query.to) filter.createdAt.lte = query.to;
    }

    const { rows: contents, total } = await this.content.findPageAdmin(
      filter,
      page,
      limit,
    );

    const userIds = [
      ...new Set(contents.map((c) => c.userId).filter(Boolean)),
    ] as string[];
    const pipelineIds = contents
      .map((c) => c.pipelineRef)
      .filter(Boolean) as string[];

    const ruleRefs = [...new Set(contents.map((c) => c.ruleRef))];

    const [users, costMap, rules] = await Promise.all([
      this.users.findManyByUserIds(userIds, {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
      }),
      pipelineIds.length
        ? this.costEntries.sumForPipelines(pipelineIds)
        : Promise.resolve(new Map<string, number>()),
      ruleRefs.length ? this.rules.findByIds(ruleRefs) : Promise.resolve([]),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.userId, u]));
    const ruleChannelMap = Object.fromEntries(
      rules.map((r) => [r.ruleId, ruleChannelNames(r)]),
    );
    const ruleNameMap = Object.fromEntries(rules.map((r) => [r.ruleId, r.name]));

    return {
      contents: contents.map((c) => {
        const u = c.userId ? userMap[c.userId] : undefined;
        return {
          contentId: c.contentId,
          status: c.status,
          userEmail: u?.email ?? 'unknown',
          displayName: u ? displayName(u) : '',
          ruleName: ruleNameMap[c.ruleRef] ?? '',
          preview: contentPreview(c),
          costUsd: costMap.get(c.pipelineRef) ?? 0,
          createdAt: c.createdAt,
          channels: ruleChannelMap[c.ruleRef] ?? [],
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getContentDetail(contentId: string) {
    const content = await this.content.findByContentId(contentId);
    if (!content) throw new NotFoundException('Content not found');

    const [user, pipeline, costs, rule] = await Promise.all([
      content.userId
        ? this.users.findByUserId(content.userId)
        : Promise.resolve(null),
      this.pipelines.findById(content.pipelineRef),
      this.costEntries.findByPipeline(content.pipelineRef),
      this.rules.findById(content.ruleRef),
    ]);

    const totalCost = costs.reduce((sum, row) => sum + row.costUsd, 0);

    return {
      status: content.status,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      preview: contentPreview(content),
      ruleName: rule?.name ?? '',
      user: user
        ? {
            userId: user.userId,
            email: user.email,
            displayName: displayName(user),
          }
        : null,
      pipeline: pipeline
        ? {
            status: pipeline.status,
            contentPrompt: pipeline.contentPrompt,
            startedAt: pipeline.startedAt,
            completedAt: pipeline.completedAt,
          }
        : null,
      costUsd: totalCost,
      costBreakdown: costs.map((row) => ({
        nodeType: row.nodeType,
        model: row.providerModel,
        costUsd: row.costUsd,
      })),
    };
  }
}
