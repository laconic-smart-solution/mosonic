-- Presenter-only typed columns on workflow_video_node_configs (additive, nullable).
ALTER TABLE "workflow_video_node_configs"
  ADD COLUMN "heygenOrientation" TEXT,
  ADD COLUMN "heygenExpressiveness" TEXT,
  ADD COLUMN "heygenMotionPrompt" TEXT,
  ADD COLUMN "heygenBackgroundAssetId" TEXT,
  ADD COLUMN "heygenBackgroundUrl" TEXT,
  ADD COLUMN "removeBackground" BOOLEAN,
  ADD COLUMN "heygenAvatarAssetId" TEXT,
  ADD COLUMN "heygenAvatarPhotoUrl" TEXT,
  ADD COLUMN "resolution" TEXT;

-- Backfill from config JSON (JSON stays as the transition fallback).
UPDATE "workflow_video_node_configs" v SET
  "heygenOrientation" = NULLIF(n."config"->>'heygenOrientation', ''),
  "heygenExpressiveness" = NULLIF(n."config"->>'heygenExpressiveness', ''),
  "heygenMotionPrompt" = NULLIF(n."config"->>'heygenMotionPrompt', ''),
  "heygenBackgroundAssetId" = NULLIF(n."config"->>'heygenBackgroundAssetId', ''),
  "heygenBackgroundUrl" = NULLIF(n."config"->>'heygenBackgroundUrl', ''),
  "removeBackground" = CASE WHEN jsonb_typeof(n."config"->'removeBackground') = 'boolean'
                            THEN (n."config"->>'removeBackground')::boolean END,
  "heygenAvatarAssetId" = NULLIF(n."config"->>'heygenAvatarAssetId', ''),
  "heygenAvatarPhotoUrl" = NULLIF(n."config"->>'heygenAvatarPhotoUrl', ''),
  "resolution" = NULLIF(n."config"->>'resolution', '')
FROM "workflow_nodes" n
WHERE n."nodeId" = v."nodeId";