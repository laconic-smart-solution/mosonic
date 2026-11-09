import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleService } from '../rule.service';
import { brandNameFromWebsiteUrl } from '../chat/blank-brand.util';
import { toolError } from './tool-error.util';
import { rejectUntrustedUrl } from './url-guard.util';
import { channelsNamedIn, intakeFromArgs } from './create-rule-from-intake.tool';

const INGEST_WEBSITE_CONTENT_SCHEMA = z.object({
  url: z
    .string()
    .describe(
      "The brand or listing website URL to extract brand identity, description, value proposition, and facts from (must start with http:// or https://).",
    ),
  postGoal: z
    .string()
    .optional()
    .describe(
      "Optional intent of the post if known (e.g. 'room_offer', 'brand_intro', 'announcement') to target specific factual extraction.",
    ),
});

/**
 * Extracts and ingests brand content, business identity, and room/product facts
 * from a live website URL directly into the current Brand Profile.
 * Operates independently from image fetching so content is never blocked by image absence.
 */
export function createIngestWebsiteContentTool(
  getRuleId: () => string | null,
  ruleService: RuleService,
  auth: TenancyAuth,
  getUserTexts?: () => string[],
  onListingFacts?: (facts: Record<string, unknown>) => void,
) {
  return tool(
    async ({ url, postGoal }) => {
      const ruleId = getRuleId();
      if (!ruleId) {
        return toolError(
          'no_brand',
          'No brand profile exists yet. Create or select a brand profile first.',
        );
      }

      const targetUrl = url.trim();
      const rejected = rejectUntrustedUrl(targetUrl, getUserTexts?.());
      if (rejected) {
        return toolError(
          'url_not_provided',
          `${rejected} Nothing was ingested. If no web search or message contains the site URL, ask the user to provide it.`,
        );
      }

      const seedName = brandNameFromWebsiteUrl(targetUrl);
      const userWords = getUserTexts ? getUserTexts() : [];
      const channels = channelsNamedIn(userWords);

      // Patch the shell name immediately so "Untitled brand" disappears
      try {
        await ruleService.patchRule(
          ruleId,
          {
            name: seedName,
            brand: {
              brandName: seedName,
              brandDescription: `Brand website: ${targetUrl}`,
            },
          },
          auth,
        );
      } catch {
        // non-blocking best effort
      }

      const intake = intakeFromArgs(seedName, channels);
      const result = await ruleService.extractIntoRuleAndAwait(
        ruleId,
        {
          input: `Brand website: ${targetUrl}. Extract the brand identity, value proposition, and key offerings from this site.`,
          files: [],
          urls: [targetUrl],
          intake,
        },
        auth,
        25000,
      );

      if (result.status === 'FAILED') {
        return JSON.stringify({
          status: 'FAILED',
          readiness: 'FAILED',
          error: result.error,
          message: `Failed to extract brand content from ${targetUrl}: ${result.error}. Ask the user for brand details or to verify the URL.`,
        });
      }

      if (result.status === 'EXTRACTING') {
        return JSON.stringify({
          status: 'EXTRACTING',
          readiness: 'EXTRACTING',
          sourceUrl: targetUrl,
          message: `Extraction is currently in progress for ${targetUrl}. Please wait a moment before setting up the workflow or generating content.`,
        });
      }

      const updated = result.rule;
      const brand = (updated?.brand && typeof updated.brand === 'object' ? updated.brand : {}) as Record<string, unknown>;
      const brandName = String(updated?.name || brand.brandName || seedName);
      const brandDescription = String(brand.brandDescription || '');
      const industry = String(brand.industry || '');

      // Identify any listing/room facts if this is a listing or specific offer
      const isRoomOrListing =
        postGoal === 'room_offer' ||
        /(room|apartment|rent|studio|suite|condo|flat|leasing|stay)/i.test(`${brandDescription} ${userWords.join(' ')}`);

      const listingFacts: Record<string, unknown> = {
        sourceUrl: targetUrl,
        fetchedAt: new Date().toISOString(),
      };

      const missingFields: string[] = [];
      if (isRoomOrListing) {
        // Check if room price or availability was extracted
        const hasPrice = /\b(\$|฿|€|£|\brent\b|\bmonth\b|\bdeposit\b|\d{3,})/i.test(brandDescription);
        if (!hasPrice) {
          missingFields.push('room_price');
        }
      }

      if (onListingFacts) {
        onListingFacts(listingFacts);
      }

      return JSON.stringify({
        status: 'COMPLETED',
        readiness: 'READY',
        brandName,
        brandDescription,
        industry,
        sourceUrl: targetUrl,
        fetchedAt: listingFacts.fetchedAt,
        listingFacts,
        ...(missingFields.length > 0 ? { missingListingFields: missingFields } : {}),
        message: `Brand profile for "${brandName}" successfully ingested and is READY. Next: call fetch_website_assets to retrieve brand logos and imagery (images operate independently), or proceed to prepare workflow.`,
      });
    },
    {
      name: 'ingest_website_content',
      description:
        "Ingests brand profile, description, value proposition, and key facts from a live website URL. Always call this when the user supplies a brand or listing website URL to establish or update their brand profile. This operates independently of image fetching.",
      schema: INGEST_WEBSITE_CONTENT_SCHEMA,
    },
  );
}

