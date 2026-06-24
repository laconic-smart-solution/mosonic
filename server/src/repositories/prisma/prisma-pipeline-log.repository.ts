import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { PipelineLogRecord } from '../../domain/pipeline/pipeline.types';
import type {
  AppendPipelineLogInput,
  IPipelineLogRepository,
} from '../interfaces/pipeline-log.repository.interface';

@Injectable()
export class PrismaPipelineLogRepository implements IPipelineLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPipelineRef(
    pipelineRef: string,
    limit = 500,
  ): Promise<PipelineLogRecord[]> {
    return this.prisma.pipelineLog.findMany({
      where: { pipelineRef },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });
  }

  append(dto: AppendPipelineLogInput): Promise<PipelineLogRecord> {
    return this.prisma.pipelineLog.create({
      data: {
        pipelineRef: dto.pipelineRef,
        workflowRef: dto.workflowRef,
        nodeId: dto.nodeId,
        nodeType: dto.nodeType,
        order: dto.order,
        level: dto.level,
        status: dto.status,
        message: dto.message,
        retryCount: dto.retryCount ?? 0,
        timestamp: dto.timestamp ?? new Date(),
        expiresAt: dto.expiresAt,
      },
    });
  }
}
