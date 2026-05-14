import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { mergeResolvedOutputs } from './content-output.utils';
import type {
  ContentPageItemDto,
  ContentPageQueryDto,
} from './dto/content-page-query.dto';
import {
  Content,
  ContentStatus,
  type ContentDocument,
  type ContentOutputs,
  type ContentUserEdits,
} from './schemas/content.schema';

@Injectable()
export class ContentRepository {
  constructor(
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
  ) {}

  async findById(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<ContentDocument | null> {
    return this.contentModel
      .findOne(mergeUserIdFilter({ contentId }, auth))
      .exec();
  }

  async findByIdLean(contentId: string, auth: TenancyAuth) {
    return this.contentModel
      .findOne(mergeUserIdFilter({ contentId }, auth))
      .lean()
      .exec();
  }

  async findPage(
    query: ContentPageQueryDto,
    auth: TenancyAuth,
  ): Promise<{
    data: ContentPageItemDto[];
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const filter: Record<string, unknown> = mergeUserIdFilter({}, auth);
    if (query.filter?.workflowRef)
      filter.workflowRef = query.filter.workflowRef;
    if (query.filter?.ruleRef) filter.ruleRef = query.filter.ruleRef;
    if (query.filter?.pipelineRef)
      filter.pipelineRef = query.filter.pipelineRef;
    if (query.filter?.status) filter.status = query.filter.status;

    const andClauses: Record<string, unknown>[] = [];
    const nonWhitespaceOr = (
      field: 'image' | 'video' | 'summary',
    ): Record<string, unknown> => ({
      $or: [
        { [`outputs.${field}`]: { $regex: /\S/ } },
        { [`userEdits.${field}`]: { $regex: /\S/ } },
      ],
    });
    if (query.filter?.hasImage === true)
      andClauses.push(nonWhitespaceOr('image'));
    if (query.filter?.hasVideo === true)
      andClauses.push(nonWhitespaceOr('video'));
    if (query.filter?.hasSummary === true)
      andClauses.push(nonWhitespaceOr('summary'));

    const searchTrim = query.search?.trim();
    if (searchTrim) {
      const escaped = escapeRegExp(searchTrim);
      andClauses.push({
        $or: [
          { contentId: { $regex: escaped, $options: 'i' } },
          { ruleRef: { $regex: escaped, $options: 'i' } },
          { workflowRef: { $regex: escaped, $options: 'i' } },
          { pipelineRef: { $regex: escaped, $options: 'i' } },
        ],
      });
    }
    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    const [docs, total] = await Promise.all([
      this.contentModel
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(
          'contentId pipelineRef workflowRef ruleRef status createdAt updatedAt outputs userEdits',
        )
        .lean()
        .exec(),
      this.contentModel.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map((doc) => {
        const withDates = doc as {
          createdAt?: Date | string;
          updatedAt?: Date | string;
          outputs?: ContentOutputs;
          userEdits?: ContentUserEdits;
        };
        return {
          contentId: doc.contentId,
          pipelineRef: doc.pipelineRef,
          workflowRef: doc.workflowRef,
          ruleRef: doc.ruleRef,
          status: doc.status,
          createdAt: new Date(withDates.createdAt ?? new Date()).toISOString(),
          updatedAt: new Date(withDates.updatedAt ?? new Date()).toISOString(),
          outputs: mergeResolvedOutputs(withDates),
        };
      }),
      total,
    };
  }

  async updateEditableState(
    contentId: string,
    payload: {
      outputs?: ContentOutputs;
      userEdits?: ContentUserEdits;
      nodePromptOverrides?: Record<string, string>;
      nodeOutputs?: Record<string, Record<string, unknown>>;
      nodeUserEdits?: Record<string, Record<string, unknown>>;
    },
    auth: TenancyAuth,
  ): Promise<{ matchedCount: number }> {
    const res = await this.contentModel
      .updateOne(mergeUserIdFilter({ contentId }, auth), { $set: payload })
      .exec();
    return { matchedCount: res.matchedCount };
  }

  async updateStatus(
    contentId: string,
    status: ContentStatus,
    auth: TenancyAuth,
  ): Promise<void> {
    await this.contentModel
      .updateOne(mergeUserIdFilter({ contentId }, auth), {
        $set: { status },
      })
      .exec();
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
