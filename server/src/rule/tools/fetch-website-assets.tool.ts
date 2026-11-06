import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WebsiteAssetHandler } from '../../preprocessing/handlers/website-asset.handler';
import type { RuleAssetService } from '../rule-asset.service';
import { toolError } from './tool-error.util';
import { rejectUntrustedUrl } from './url-guard.util';

const MAX_IMAGES = 8;

const FETCH_WEBSITE_ASSETS_SCHEMA = z.object({
  url: z
    .string()
    .describe(
      "The brand's website URL to pull logo/brand images from (must start with http:// or https://).",
    ),
});

/**
 * Discovers and saves a handful of brand images from a live website
 * (favicon/logo, og:image, header/nav <img>s) as Rule assets — reuses
 * RuleAssetService.upload as-is by handing it a plain buffer/mimetype/name
 * object shaped like Express.Multer.File, same as a manual file upload.
 */
export function createFetchWebsiteAssetsTool(
  getRuleId: () => string | null,
  websiteAssetHandler: WebsiteAssetHandler,
  ruleAssetService: RuleAssetService,
  auth: TenancyAuth,
  /** User messages + web_search results this session; a URL must come from them. */
  getUserTexts?: () => string[],
  /**
   * Optional: after images save, seed an Untitled Welcome shell (name +
   * description from the URL) so the blank-brand gate lifts next turn.
   */
  seedBlankBrand?: (ruleId: string, url: string) => Promise<void>,
) {
  return tool(
    async ({ url }) => {
      const ruleId = getRuleId();
      if (!ruleId) {
        return 'No brand profile exists yet — call create_rule_from_intake first, then fetch images from the site.';
      }
      const rejected = rejectUntrustedUrl(url.trim(), getUserTexts?.());
      if (rejected) {
        return toolError(
          'url_not_provided',
          `${rejected} Nothing was fetched. If no web search or message has the brand's site, ask the user to paste it.`,
        );
      }

      let images;
      try {
        images = await websiteAssetHandler.discoverImages(url, MAX_IMAGES);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return `Could not fetch images from ${url}: ${reason}`;
      }

      if (images.length === 0) {
        return `No usable images found on ${url}.`;
      }

      const saved: string[] = [];
      for (const [index, image] of images.entries()) {
        const type = index === 0 ? 'logo' : 'reference_image';
        const file = {
          buffer: image.buffer,
          mimetype: image.mimeType,
          originalname: image.originalFileName,
          size: image.buffer.length,
        } as Express.Multer.File;

        try {
          await ruleAssetService.upload(ruleId, type, file, auth);
          saved.push(type);
        } catch {
          // skip a single failed asset, keep going with the rest
        }
      }

      if (saved.length === 0) {
        return `Found images on ${url} but none could be saved.`;
      }

      let seeded = false;
      if (seedBlankBrand) {
        try {
          await seedBlankBrand(ruleId, url.trim());
          seeded = true;
        } catch {
          // seeding is best-effort; assets are already saved
        }
      }

      const next =
        'Next: if the user asked for a post, call update_rule (channels they named), apply_default_workflow, then start_generation — do not stop at assets alone.';
      return seeded
        ? `Saved ${saved.length} asset(s) from ${url}: ${saved.join(', ')}. Seeded brand name/description from the site. ${next}`
        : `Saved ${saved.length} asset(s) from ${url}: ${saved.join(', ')}. They'll finish processing shortly — call list_brand_assets to check. ${next}`;
    },
    {
      name: 'fetch_website_assets',
      description:
        "Pull brand images (logo, favicon, hero/og image) from the brand's live website and save them as brand assets. Use the URL the user gave or one web_search found for this brand (don't ask for it again) — never guess one.",
      schema: FETCH_WEBSITE_ASSETS_SCHEMA,
    },
  );
}