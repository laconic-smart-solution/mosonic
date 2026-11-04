import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleAssetService } from '../rule-asset.service';

const LIST_BRAND_ASSETS_SCHEMA = z.object({});

export function createListBrandAssetsTool(
  ruleId: string,
  ruleAssetService: RuleAssetService,
  auth: TenancyAuth,
) {
  return tool(
    async () => {
      const assets = await ruleAssetService.listByRule(ruleId, auth);
      if (assets.length === 0) {
        return 'No brand assets uploaded yet (no logo, reference images, or guideline documents).';
      }
      return assets
        .map(
          (a) =>
            `- [${a.type}] ${a.originalFileName} (status: ${a.status})`,
        )
        .join('\n');
    },
    {
      name: 'list_brand_assets',
      description:
        "List this brand's uploaded assets (logo, reference images, guideline documents) with their status. Call this before claiming a logo or reference image is or isn't available — don't assume.",
      schema: LIST_BRAND_ASSETS_SCHEMA,
    },
  );
}
