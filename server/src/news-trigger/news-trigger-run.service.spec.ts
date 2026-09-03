import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { NEWS_TRIGGER_QUEUE } from './news-trigger.constants';
import { Test, TestingModule } from '@nestjs/testing';
import { Rule } from '../rule/schemas/rule.schema';
import { NewsTriggerLog } from './schemas/news-trigger-log.schema';
import { NewsTriggerRunService } from './news-trigger-run.service';

describe('NewsTriggerRunService', () => {
  let service: NewsTriggerRunService;
  let ruleModel: { findOne: jest.Mock };
  let logModel: { findOne: jest.Mock };

  const auth = { userId: 'user-1', role: 'customer' as const };

  beforeEach(async () => {
    ruleModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ ruleId: 'rule-1' }),
      }),
    };
    logModel = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsTriggerRunService,
        { provide: getModelToken(Rule.name), useValue: ruleModel },
        { provide: getModelToken(NewsTriggerLog.name), useValue: logModel },
        {
          provide: getQueueToken(NEWS_TRIGGER_QUEUE),
          useValue: {
            getJob: jest.fn().mockResolvedValue(null),
            getJobs: jest.fn().mockResolvedValue([]),
            getJobCounts: jest
              .fn()
              .mockResolvedValue({ waiting: 0, active: 0 }),
          },
        },
      ],
    }).compile();

    service = module.get(NewsTriggerRunService);
  });

  it('getLatestManualRun returns null when no logs', async () => {
    logModel.findOne().sort().lean().exec.mockResolvedValue(null);
    const result = await service.getLatestManualRun('rule-1', auth);
    expect(result).toBeNull();
  });

  it('getRunById returns pending when log missing', async () => {
    logModel.findOne().lean().exec.mockResolvedValue(null);
    const result = await service.getRunById('rule-1', 'run-xyz', auth);
    expect(result.status).toBe('running');
    expect(result.runId).toBe('run-xyz');
  });

  it('getRunById throws when run belongs to another rule', async () => {
    logModel.findOne().lean().exec.mockResolvedValue({
      runId: 'run-1',
      group: 'manual:other-rule',
      completedAt: new Date(),
      pipelinesTriggered: 0,
      details: [],
    });

    await expect(service.getRunById('rule-1', 'run-1', auth)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when rule not found', async () => {
    ruleModel.findOne().select().lean().exec.mockResolvedValue(null);
    await expect(service.getLatestManualRun('missing', auth)).rejects.toThrow(
      NotFoundException,
    );
  });
});
