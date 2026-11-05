-- Typed 1:1 config for video_cinematic / video_presenter nodes (+ look FK).
CREATE TABLE "workflow_video_node_configs" (
    "nodeId" TEXT NOT NULL,
    "mode" TEXT,
    "cinematicMode" TEXT,
    "heygenVideoMode" TEXT,
    "duration" INTEGER,
    "aspectRatio" TEXT,
    "heygenVoiceId" TEXT,
    "heygenAvatarId" TEXT,
    "heygenAvatarIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heygenCinematicModel" TEXT,
    "userAvatarLookId" TEXT,
    "sourceRuleAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_video_node_configs_pkey" PRIMARY KEY ("nodeId")
);

CREATE INDEX "workflow_video_node_configs_userAvatarLookId_idx" ON "workflow_video_node_configs"("userAvatarLookId");
CREATE INDEX "workflow_video_node_configs_sourceRuleAssetId_idx" ON "workflow_video_node_configs"("sourceRuleAssetId");

ALTER TABLE "workflow_video_node_configs" ADD CONSTRAINT "workflow_video_node_configs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "workflow_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_video_node_configs" ADD CONSTRAINT "workflow_video_node_configs_userAvatarLookId_fkey" FOREIGN KEY ("userAvatarLookId") REFERENCES "heygen_user_avatars"("lookId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_video_node_configs" ADD CONSTRAINT "workflow_video_node_configs_sourceRuleAssetId_fkey" FOREIGN KEY ("sourceRuleAssetId") REFERENCES "rule_assets"("ruleAssetId") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from existing config JSON (JSON stays as the transition fallback).
INSERT INTO "workflow_video_node_configs" (
  "nodeId", "mode", "cinematicMode", "heygenVideoMode", "duration", "aspectRatio",
  "heygenVoiceId", "heygenAvatarId", "heygenAvatarIds", "heygenCinematicModel",
  "userAvatarLookId", "updatedAt"
)
SELECT
  n."nodeId",
  NULLIF(n."config"->>'mode', ''),
  NULLIF(n."config"->>'cinematicMode', ''),
  NULLIF(n."config"->>'heygenVideoMode', ''),
  CASE WHEN jsonb_typeof(n."config"->'duration') = 'number' THEN ROUND((n."config"->>'duration')::numeric)::int END,
  NULLIF(n."config"->>'aspectRatio', ''),
  NULLIF(n."config"->>'heygenVoiceId', ''),
  NULLIF(n."config"->>'heygenAvatarId', ''),
  CASE WHEN jsonb_typeof(n."config"->'heygenAvatarIds') = 'array'
       THEN ARRAY(SELECT jsonb_array_elements_text(n."config"->'heygenAvatarIds'))
       ELSE ARRAY[]::TEXT[] END,
  NULLIF(n."config"->>'heygenCinematicModel', ''),
  a."lookId",
  CURRENT_TIMESTAMP
FROM "workflow_nodes" n
LEFT JOIN "heygen_user_avatars" a ON a."lookId" = NULLIF(n."config"->>'heygenAvatarId', '')
WHERE n."type"::text IN ('video_cinematic', 'video_presenter');
