import { Test } from '@nestjs/testing';
import { CreditCalculationService } from './credit-calculation.service';
import { NodeCreditPriceService } from './node-credit-price.service';
import { NODE_CREDIT_PRICE_REPOSITORY } from '../repositories/tokens';
import {
  LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
  VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
} from './lib/billable-node-credit-types';

describe('NodeCreditPriceService video credit split migration', () => {
  let service: NodeCreditPriceService;
  const findByNodeType = jest.fn();
  const create = jest.fn();
  const setActiveByNodeType = jest.fn();
  const findLegacyMissingCostUsd = jest.fn().mockResolvedValue([]);
  const updateSocialUnlockLegacy = jest.fn();
  const listByNodeTypes = jest.fn().mockResolvedValue([]);

  beforeEach(async () => {
    findByNodeType.mockReset();
    create.mockReset();
    setActiveByNodeType.mockReset();
    findLegacyMissingCostUsd.mockResolvedValue([]);
    updateSocialUnlockLegacy.mockResolvedValue(undefined);
    listByNodeTypes.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NodeCreditPriceService,
        {
          provide: NODE_CREDIT_PRICE_REPOSITORY,
          useValue: {
            findLegacyMissingCostUsd,
            findByNodeType,
            findActiveByNodeType: jest.fn(),
            listByNodeTypes,
            create,
            upsertByNodeType: jest.fn(),
            updateSocialUnlockLegacy,
            setActiveByNodeType,
            migrateLegacyRow: jest.fn(),
          },
        },
        {
          provide: CreditCalculationService,
          useValue: {
            calculateCredits: jest
              .fn()
              .mockResolvedValue({ creditsCharged: 48 }),
            getConfig: jest.fn().mockResolvedValue({
              creditPriceUsd: 0.01,
              marginTarget: 3,
              overheadFactor: 0,
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(NodeCreditPriceService);
  });

  it('copies legacy video_generation pricing to presenter and deactivates legacy row', async () => {
    findByNodeType.mockImplementation(async (nodeType: string) => {
      if (nodeType === LEGACY_VIDEO_GENERATION_CREDIT_TYPE) {
        return {
          nodeType: LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
          costUsd: 0.55,
          isActive: true,
        };
      }
      if (nodeType === VIDEO_GENERATION_PRESENTER_CREDIT_TYPE) {
        return null;
      }
      return null;
    });
    create.mockResolvedValue({});

    await service.seedDefaults();

    expect(create).toHaveBeenCalledWith({
      nodeType: VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
      costUsd: 0.55,
      isActive: true,
    });
    expect(setActiveByNodeType).toHaveBeenCalledWith(
      LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
      false,
    );
  });

  it('skips presenter copy when presenter row already exists', async () => {
    findByNodeType.mockImplementation(async (nodeType: string) => {
      if (nodeType === LEGACY_VIDEO_GENERATION_CREDIT_TYPE) {
        return {
          nodeType: LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
          costUsd: 0.55,
          isActive: true,
        };
      }
      if (nodeType === VIDEO_GENERATION_PRESENTER_CREDIT_TYPE) {
        return {
          nodeType: VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
          costUsd: 0.5,
          isActive: true,
        };
      }
      return null;
    });

    await service.seedDefaults();

    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        nodeType: VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
      }),
    );
    expect(setActiveByNodeType).toHaveBeenCalledWith(
      LEGACY_VIDEO_GENERATION_CREDIT_TYPE,
      false,
    );
  });
});
