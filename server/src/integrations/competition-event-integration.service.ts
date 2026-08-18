import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../database/prisma.service';
import { LlmService } from '../llm/llm.service';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { COMPETITION_EVENT_SYSTEM_PROMPT } from './competition-event-integration.prompt';
import type {
  CompetitionEventContentByRefResponseDto,
  CompetitionEventSocialContentResponseDto,
  GenerateCompetitionEventContentDto,
  GenerateCompetitionEventContentResponseDto,
  GenerateCompetitionEventSocialContentDto,
  SaveCompetitionEventContentDto,
  SaveCompetitionEventContentResponseDto,
} from './dto/competition-event-integration.dto';
import { PIPELINE_REPOSITORY } from '../repositories/tokens';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import { CONTENT_REPOSITORY, WORKFLOW_REPOSITORY } from '../repositories/tokens';
import type { IContentRepository } from '../repositories/interfaces/content.repository.interface';
import type { IWorkflowRepository } from '../repositories/interfaces/workflow.repository.interface';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { mergeTenancyWhere } from '../repositories/prisma/prisma.util';

const INTEGRATION_SOURCE = 'competition-event';

@Injectable()
export class CompetitionEventIntegrationService {
  private readonly logger = new Logger(CompetitionEventIntegrationService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ContentService))
    private readonly contentService: ContentService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    @Inject(CONTENT_REPOSITORY)
    private readonly contents: IContentRepository,
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
    @Inject(forwardRef(() => OrchestrationService))
    private readonly orchestration: OrchestrationService,
  ) {}

  async generateFromPrompt(
    body: GenerateCompetitionEventContentDto,
    auth: TenancyAuth,
  ): Promise<GenerateCompetitionEventContentResponseDto> {
    const externalRef = body.externalRef.trim();
    if (!externalRef) {
      throw new BadRequestException('externalRef must not be empty');
    }
    const userPrompt = body.userPrompt.trim();
    if (!userPrompt) {
      throw new BadRequestException('userPrompt must not be empty');
    }

    const existing = await this.findBundleByExternalRef(externalRef, auth);
    if (existing) {
      return {
        ...existing,
        reusedExisting: true,
      };
    }

    const bundleJson = await this.generateBundleJson(userPrompt);
    const ids = await this.createBootstrapRecords({
      auth,
      externalRef,
      userPrompt,
      bundleJson,
      payload: body.payload,
    });

    return {
      ...ids,
      externalRef,
      bundleJson,
      reusedExisting: false,
    };
  }

  async saveBundle(
    contentId: string,
    body: SaveCompetitionEventContentDto,
    auth: TenancyAuth,
  ): Promise<SaveCompetitionEventContentResponseDto> {
    const normalizedId = contentId.trim();
    const doc = await this.contents.findById(normalizedId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${normalizedId} not found`);
    }
    const bundleJson = body.bundleJson.trim();
    if (!bundleJson) {
      throw new BadRequestException('bundleJson must not be empty');
    }

    await this.contentService.saveContent(
      normalizedId,
      {
        userEdits: { text: bundleJson },
      },
      auth,
    );

    const pipeline = await this.pipelines.findById(doc.pipelineRef, auth);
    const externalRef =
      this.readExternalRef(pipeline?.metadata) ??
      `unknown/${normalizedId}`;

    await this.pipelines.updateById(
      doc.pipelineRef,
      {
        metadata: {
          ...(this.asRecord(pipeline?.metadata) ?? {}),
          externalRef,
          externalRevision: body.externalRevision,
          lastSyncedAt: new Date().toISOString(),
          integrationSource: INTEGRATION_SOURCE,
        },
      },
      auth,
    );

    return {
      success: true,
      contentId: normalizedId,
      externalRef,
    };
  }

  /** Runs the existing workflow of `ruleId` with the event detail as content prompt. */
  async generateSocialContent(
    body: GenerateCompetitionEventSocialContentDto,
    auth: TenancyAuth,
  ): Promise<CompetitionEventSocialContentResponseDto> {
    const ruleId = body.ruleId.trim();
    const externalRef = body.externalRef.trim();
    const prompt = body.prompt.trim();
    const imageUrl = body.imageUrl?.trim() || null;
    if (!ruleId) {
      throw new BadRequestException('ruleId must not be empty');
    }
    if (!externalRef) {
      throw new BadRequestException('externalRef must not be empty');
    }
    if (!prompt) {
      throw new BadRequestException('prompt must not be empty');
    }

    const workflow = await this.workflows.findLatestByRule(ruleId, auth);
    if (!workflow) {
      throw new NotFoundException(`No workflow found for rule ${ruleId}`);
    }

    const { pipelineId } = await this.orchestration.startPipeline({
      workflowId: workflow.workflowId,
      ruleId,
      contentPrompt: prompt,
      metadata: { source: 'integration' },
      auth,
    });

    const pipeline = await this.pipelines.findById(pipelineId, auth);
    await this.pipelines.updateById(
      pipelineId,
      {
        metadata: {
          ...(this.asRecord(pipeline?.metadata) ?? {}),
          integrationSource: INTEGRATION_SOURCE,
          externalRef,
          ...(imageUrl ? { externalImageUrl: imageUrl } : {}),
        },
      },
      auth,
    );

    this.logger.log(
      `Started competition-event social pipeline ${pipelineId} on rule ${ruleId} for ${externalRef}`,
    );

    return {
      pipelineId,
      workflowId: workflow.workflowId,
      ruleId,
      status: pipeline?.status ?? 'running',
      contentId: null,
      text: null,
      imageUrl,
      externalRef,
    };
  }

  /**
   * Reads a social pipeline started by {@link generateSocialContent}. Once content
   * exists, the competition-event cover image (when supplied) replaces the
   * workflow image so Mosonic and the competition-event app show the same photo.
   */
  async getSocialContent(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<CompetitionEventSocialContentResponseDto> {
    const id = pipelineId.trim();
    const pipeline = await this.pipelines.findById(id, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${id} not found`);
    }

    const metadata = this.asRecord(pipeline.metadata) ?? {};
    const externalRef = readTrimmed(metadata.externalRef);
    const coverImageUrl = readTrimmed(metadata.externalImageUrl);

    const content = await this.contents.findLatestByPipeline(id, auth);
    const merged = content
      ? { ...this.asRecord(content.outputs), ...this.asRecord(content.userEdits) }
      : {};
    const text = readTrimmed(merged.text);
    const workflowImageUrl = readTrimmed(merged.image);

    if (content && coverImageUrl && workflowImageUrl !== coverImageUrl) {
      await this.contentService.saveContent(
        content.contentId,
        { userEdits: { image: coverImageUrl } },
        auth,
      );
    }

    return {
      pipelineId: id,
      workflowId: pipeline.workflowRef,
      ruleId: pipeline.ruleRef,
      status: pipeline.status,
      contentId: content?.contentId ?? null,
      text,
      imageUrl: coverImageUrl ?? workflowImageUrl,
      externalRef,
    };
  }

  async getByExternalRef(
    externalRef: string,
    auth: TenancyAuth,
  ): Promise<CompetitionEventContentByRefResponseDto> {
    const found = await this.findBundleByExternalRef(externalRef.trim(), auth);
    if (!found) {
      throw new NotFoundException(
        `No competition-event content for externalRef ${externalRef}`,
      );
    }
    return found;
  }

  private async findBundleByExternalRef(
    externalRef: string,
    auth: TenancyAuth,
  ): Promise<CompetitionEventContentByRefResponseDto | null> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: mergeTenancyWhere(
        {
          metadata: {
            path: ['externalRef'],
            equals: externalRef,
          },
        },
        auth,
      ),
      orderBy: { startedAt: 'desc' },
    });
    if (!pipeline) {
      return null;
    }

    const content = await this.prisma.content.findFirst({
      where: mergeTenancyWhere({ pipelineRef: pipeline.pipelineId }, auth),
      orderBy: { updatedAt: 'desc' },
    });
    if (!content) {
      return null;
    }

    const bundleJson = this.resolveBundleJson(content.outputs, content.userEdits);
    if (!bundleJson) {
      return null;
    }

    return {
      contentId: content.contentId,
      pipelineId: pipeline.pipelineId,
      workflowId: pipeline.workflowRef,
      bootstrapRuleId: pipeline.ruleRef,
      externalRef,
      bundleJson,
      currentVersion: content.currentVersion ?? null,
    };
  }

  private async generateBundleJson(userPrompt: string): Promise<string> {
    const model = this.llm.getChatModel({ temperature: 0.3 });
    const response = await model.invoke([
      new SystemMessage(COMPETITION_EVENT_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
    const raw =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    const json = stripMarkdownFences(raw.trim());
    try {
      JSON.parse(json);
    } catch {
      throw new BadRequestException('LLM returned invalid JSON for event bundle');
    }
    return json;
  }

  private async createBootstrapRecords(args: {
    auth: TenancyAuth;
    externalRef: string;
    userPrompt: string;
    bundleJson: string;
    payload?: Record<string, unknown>;
  }): Promise<Omit<GenerateCompetitionEventContentResponseDto, 'externalRef' | 'bundleJson' | 'reusedExisting'>> {
    const ruleId = randomUUID();
    const workflowId = randomUUID();
    const pipelineId = randomUUID();
    const contentId = randomUUID();
    const nodeId = randomUUID();
    const userId = args.auth.userId;

    await this.prisma.rule.create({
      data: {
        ruleId,
        userId,
        name: `CE Bootstrap ${args.externalRef}`,
        status: 'active',
        brand: { brandName: 'Competition Event', brandTone: ['professional'] },
        audience: { description: 'Competition participants' },
        campaign: {
          name: args.externalRef,
          duration: { startDate: new Date(), endDate: new Date() },
        },
        channels: [{ channel: 'web', enabled: true }],
        contentGuidelines: { tone: 'professional' },
        originalInput: {
          type: 'competition-event-bootstrap',
          externalRef: args.externalRef,
        },
        intake: args.payload
          ? (args.payload as Prisma.InputJsonValue)
          : undefined,
      },
    });

    await this.prisma.workflow.create({
      data: {
        workflowId,
        userId,
        ruleRef: ruleId,
        name: `CE Bootstrap Workflow ${args.externalRef}`,
        status: 'ready',
        version: 1,
        nodes: [nodeId],
      },
    });

    await this.prisma.workflowNode.create({
      data: {
        nodeId,
        workflowRef: workflowId,
        userId,
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        userPrompt: args.userPrompt,
        config: {},
      },
    });

    await this.prisma.pipeline.create({
      data: {
        pipelineId,
        userId,
        workflowRef: workflowId,
        ruleRef: ruleId,
        contentPrompt: args.userPrompt,
        name: `CE ${args.externalRef}`,
        status: 'completed',
        completedAt: new Date(),
        metadata: {
          source: 'integration',
          integrationSource: INTEGRATION_SOURCE,
          externalRef: args.externalRef,
          externalRevision: 1,
        },
      },
    });

    await this.prisma.content.create({
      data: {
        contentId,
        userId,
        pipelineRef: pipelineId,
        workflowRef: workflowId,
        ruleRef: ruleId,
        status: 'draft',
        outputs: { text: args.bundleJson },
        currentVersion: 1,
        versions: [
          {
            versionNumber: 1,
            outputs: { text: args.bundleJson },
            userEdits: {},
            nodePromptOverrides: {},
            createdAt: new Date(),
          },
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Created competition-event bootstrap content ${contentId} for ${args.externalRef}`,
    );

    return {
      contentId,
      pipelineId,
      workflowId,
      bootstrapRuleId: ruleId,
    };
  }

  private resolveBundleJson(outputs: unknown, userEdits: unknown): string | null {
    const merged = { ...this.asRecord(outputs), ...this.asRecord(userEdits) };
    const text = merged.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  }

  private readExternalRef(metadata: unknown): string | undefined {
    const ref = this.asRecord(metadata)?.externalRef;
    return typeof ref === 'string' && ref.trim() ? ref.trim() : undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}

function readTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stripMarkdownFences(raw: string): string {
  if (raw.startsWith('```')) {
    const firstNewline = raw.indexOf('\n');
    const lastFence = raw.lastIndexOf('```');
    if (firstNewline > 0 && lastFence > firstNewline) {
      return raw.substring(firstNewline + 1, lastFence).trim();
    }
  }
  return raw;
}
