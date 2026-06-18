import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Content, type ContentDocument } from '../../content/schemas/content.schema';
import { CostEntry, type CostEntryDocument } from '../../cost/schemas/cost-entry.schema';
import { Pipeline, type PipelineDocument } from '../../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../../rule/schemas/rule.schema';
import { User, type UserDocument } from '../../users/schemas/user.schema';

function displayName(u: {
  firstName?: string;
  lastName?: string;
  username?: string;
}): string {
  const parts = [u.firstName, u.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.join(' ');
  return u.username ?? '';
}

function contentPreview(content: {
  userEdits?: { text?: string; translatedText?: string };
  outputs?: { text?: string; translatedText?: string };
}): string | undefined {
  const text =
    content.userEdits?.text ??
    content.outputs?.text ??
    content.userEdits?.translatedText ??
    content.outputs?.translatedText;
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}

@Injectable()
export class AdminContentService {
  constructor(
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CostEntry.name)
    private readonly costModel: Model<CostEntryDocument>,
    @InjectModel(Rule.name) private readonly ruleModel: Model<RuleDocument>,
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

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.userId) filter.userId = query.userId;
    if (query.from || query.to) {
      filter.createdAt = {} as Record<string, Date>;
      if (query.from) (filter.createdAt as Record<string, Date>).$gte = query.from;
      if (query.to) (filter.createdAt as Record<string, Date>).$lte = query.to;
    }

    const [contents, total] = await Promise.all([
      this.contentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.contentModel.countDocuments(filter),
    ]);

    const userIds = [...new Set(contents.map((c) => c.userId).filter(Boolean))] as string[];
    const pipelineIds = contents
      .map((c) => c.pipelineRef)
      .filter(Boolean) as string[];

    const ruleRefs = [...new Set(contents.map((c) => c.ruleRef))];

    const [users, costs, rules] = await Promise.all([
      this.userModel
        .find(
          { userId: { $in: userIds } },
          { userId: 1, email: 1, firstName: 1, lastName: 1, username: 1 },
        )
        .lean(),
      pipelineIds.length
        ? this.costModel.aggregate([
            { $match: { pipelineRef: { $in: pipelineIds } } },
            { $group: { _id: '$pipelineRef', total: { $sum: '$costUsd' } } },
          ])
        : Promise.resolve([] as { _id: string; total: number }[]),
      ruleRefs.length
        ? this.ruleModel
            .find({ ruleId: { $in: ruleRefs } }, { ruleId: 1, name: 1, channels: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.userId, u]));
    const costMap = Object.fromEntries(costs.map((c) => [c._id, c.total]));
    const ruleChannelMap = Object.fromEntries(
      rules.map((r) => {
        const chs = (r.channels ?? [])
          .map((x) => x.channel)
          .filter(Boolean) as string[];
        return [r.ruleId, chs];
      }),
    );
    const ruleNameMap = Object.fromEntries(
      rules.map((r) => [r.ruleId, r.name]),
    );

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
          costUsd: costMap[c.pipelineRef] ?? 0,
          createdAt: (c as { createdAt?: Date }).createdAt,
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
    const content = await this.contentModel.findOne({ contentId }).lean();
    if (!content) throw new NotFoundException('Content not found');

    const [user, pipeline, costs, rule] = await Promise.all([
      content.userId
        ? this.userModel
            .findOne(
              { userId: content.userId },
              { userId: 1, email: 1, firstName: 1, lastName: 1, username: 1 },
            )
            .lean()
        : Promise.resolve(null),
      this.pipelineModel.findOne({ pipelineId: content.pipelineRef }).lean(),
      this.costModel.find({ pipelineRef: content.pipelineRef }).lean(),
      this.ruleModel.findOne({ ruleId: content.ruleRef }, { name: 1 }).lean(),
    ]);

    const totalCost = costs.reduce((sum, row) => sum + row.costUsd, 0);

    return {
      status: content.status,
      createdAt: (content as { createdAt?: Date }).createdAt,
      updatedAt: (content as { updatedAt?: Date }).updatedAt,
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
