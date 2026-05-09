import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  ContentPageItemDto,
  ContentPageQueryDto,
} from './dto/content-page-query.dto';
import {
  Content,
  ContentStatus,
  type ContentDocument,
  type ContentVersionEntry,
} from './schemas/content.schema';

@Injectable()
export class ContentRepository {
  constructor(
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
  ) {}

  async findById(contentId: string): Promise<ContentDocument | null> {
    return this.contentModel.findOne({ contentId }).exec();
  }

  async findByIdLean(contentId: string) {
    return this.contentModel.findOne({ contentId }).lean().exec();
  }

  async findPage(query: ContentPageQueryDto): Promise<{
    data: ContentPageItemDto[];
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const filter: Record<string, unknown> = {};
    if (query.filter?.workflowRef)
      filter.workflowRef = query.filter.workflowRef;
    if (query.filter?.ruleRef) filter.ruleRef = query.filter.ruleRef;
    if (query.filter?.pipelineRef)
      filter.pipelineRef = query.filter.pipelineRef;
    if (query.filter?.status) filter.status = query.filter.status;

    const [docs, total] = await Promise.all([
      this.contentModel
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .select(
          'contentId pipelineRef workflowRef ruleRef status currentVersion createdAt updatedAt',
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
        };
        return {
          contentId: doc.contentId,
          pipelineRef: doc.pipelineRef,
          workflowRef: doc.workflowRef,
          ruleRef: doc.ruleRef,
          status: doc.status,
          currentVersion: doc.currentVersion,
          createdAt: new Date(withDates.createdAt ?? new Date()).toISOString(),
          updatedAt: new Date(withDates.updatedAt ?? new Date()).toISOString(),
        };
      }),
      total,
    };
  }

  async replaceVersionsAndSetCurrent(
    contentId: string,
    entries: ContentVersionEntry[],
    newCurrentVersion: number,
  ): Promise<void> {
    await this.contentModel
      .updateOne(
        { contentId },
        {
          $set: {
            versions: entries,
            currentVersion: newCurrentVersion,
          },
        },
      )
      .exec();
  }

  async updateCurrentVersion(
    contentId: string,
    versionNumber: number,
  ): Promise<void> {
    await this.contentModel
      .updateOne({ contentId }, { $set: { currentVersion: versionNumber } })
      .exec();
  }

  async updateStatus(contentId: string, status: ContentStatus): Promise<void> {
    await this.contentModel
      .updateOne({ contentId }, { $set: { status } })
      .exec();
  }
}
