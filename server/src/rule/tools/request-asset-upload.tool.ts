import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const REQUEST_ASSET_UPLOAD_SCHEMA = z.object({
  assetType: z.enum(['logo', 'reference_image', 'guideline_document']),
});

/**
 * Pure UI-signal tool — does no I/O. The client recognizes this marker in an
 * `observation` step and renders an inline "Upload" CTA (opening the Brand
 * Assets panel) instead of raw text. The model never receives file bytes.
 */
export function createRequestAssetUploadTool() {
  return tool(
    async ({ assetType }) => {
      return JSON.stringify({ action: 'request_upload', assetType });
    },
    {
      name: 'request_asset_upload',
      description:
        "Ask the user to upload a missing brand asset (logo, reference image, or guideline document) via the UI. Use this instead of asking in plain text when list_brand_assets shows the asset is missing — this renders an actual upload button for the user.",
      schema: REQUEST_ASSET_UPLOAD_SCHEMA,
    },
  );
}
