import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventsService } from '../events/events.service';
import { Rule, RuleStatus } from '../rule/schemas/rule.schema';
import { WorkflowResolveService } from '../workflow/workflow-resolve.service';
import { NewsTriggerLog } from './schemas/news-trigger-log.schema';
import {
  NEWS_TRIGGER_JOB_PROCESS_SINGLE,
  NEWS_TRIGGER_QUEUE,
} from './news-trigger.constants';
import { NewsTriggerManualService } from './news-trigger-manual.service';

describe('NewsTriggerManualService', () => {
  let service: NewsTriggerManualService;
  let ruleModel: { findOne: jest.Mock; exec: jest.Mock };
  let queue: {
    add: jest.Mock;
    getJob: jest.Mock;
    getJobCounts: jest.Mock;
    getJobs: jest.Mock;
  };
  let logModel: { create: jest.Mock };
  let workflowResolve: { resolveLatestReadyWorkflowId: jest.Mock };

  const auth = { userId: 'user-1', role: 'customer' as const };

  beforeEach(async () => {
    ruleModel = {
      findOne: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };
    queue = {
      add: jest.fn().mockResolvedValue({
        getState: jest.fn().mockResolvedValue('waiting'),
      }),
      getJob: jest.fn().mockResolvedValue(null),
      getJobs: jest.fn().mockResolvedValue([]),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0 }),
    };
    logModel = {
      create: jest.fn().mockResolvedValue({ runId: 'run-1' }),
    };
    workflowResolve = {
      resolveLatestReadyWorkflowId: jest.fn().mockResolvedValue('wf-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsTriggerManualService,
        { provide: getModelToken(Rule.name), useValue: ruleModel },
        { provide: getModelToken(NewsTriggerLog.name), useValue: logModel },
        { provide: getQueueToken(NEWS_TRIGGER_QUEUE), useValue: queue },
        { provide: WorkflowResolveService, useValue: workflowResolve },
        {
          provide: EventsService,
          useValue: { emitToRule: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(NewsTriggerManualService);
  });

  it('enqueues a manual run job', async () => {
    ruleModel.exec.mockResolvedValue({
      ruleId: 'rule-1',
      userId: 'user-1',
      status: RuleStatus.Active,
    });

    const result = await service.enqueueManualRun('rule-1', auth);

    expect(result.status).toBe('queued');
    expect(result.runId).toBeDefined();
    expect(logModel.create).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      NEWS_TRIGGER_JOB_PROCESS_SINGLE,
      expect.objectContaining({
        ruleId: 'rule-1',
        userId: 'user-1',
        runId: result.runId,
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^news-trigger-manual-rule-1-.+/),
      }),
    );
  });

  it('throws 404 when rule not found', async () => {
    ruleModel.exec.mockResolvedValue(null);

    await expect(service.enqueueManualRun('missing', auth)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 400 when rule is not active', async () => {
    ruleModel.exec.mockResolvedValue({
      ruleId: 'rule-1',
      userId: 'user-1',
      status: RuleStatus.Archived,
    });

    await expect(service.enqueueManualRun('rule-1', auth)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws 400 when no ready workflow', async () => {
    ruleModel.exec.mockResolvedValue({
      ruleId: 'rule-1',
      userId: 'user-1',
      status: RuleStatus.Active,
    });
    workflowResolve.resolveLatestReadyWorkflowId.mockResolvedValue(null);

    await expect(service.enqueueManualRun('rule-1', auth)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws 409 when a job is already waiting', async () => {
    ruleModel.exec.mockResolvedValue({
      ruleId: 'rule-1',
      userId: 'user-1',
      status: RuleStatus.Active,
    });
    queue.getJobs.mockResolvedValue([
      {
        name: NEWS_TRIGGER_JOB_PROCESS_SINGLE,
        id: 'job-1',
        data: { ruleId: 'rule-1', runId: 'run-old', userId: 'user-1' },
        getState: jest.fn().mockResolvedValue('waiting'),
      },
    ]);

    await expect(service.enqueueManualRun('rule-1', auth)).rejects.toThrow(
      ConflictException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });
});
