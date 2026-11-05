-- Phase 2 typed 1:1 configs for non-video workflow node families
-- (text / translation / image / media / branch). No credit columns yet.
-- CreateTable
CREATE TABLE "workflow_text_node_configs" (
    "nodeId" TEXT NOT NULL,
    "laneId" TEXT,
    "channel" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "outputFormat" TEXT,
    "tone" TEXT,
    "textLength" TEXT,
    "summaryLength" TEXT,
    "sourceNodeRef" TEXT,
    "contentStyle" TEXT,
    "searchType" TEXT,
    "customPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_text_node_configs_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "workflow_translation_node_configs" (
    "nodeId" TEXT NOT NULL,
    "laneId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "sourceLanguage" TEXT,
    "targetLanguage" TEXT,
    "formalityLevel" TEXT,
    "preserveFormatting" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_translation_node_configs_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "workflow_image_node_configs" (
    "nodeId" TEXT NOT NULL,
    "laneId" TEXT,
    "channel" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "size" TEXT,
    "quality" TEXT,
    "style" TEXT,
    "template" TEXT,
    "designStyle" TEXT,
    "aspectRatio" TEXT,
    "negativePrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_image_node_configs_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "workflow_media_node_configs" (
    "nodeId" TEXT NOT NULL,
    "laneId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "sourceType" TEXT,
    "language" TEXT,
    "sourceUrl" TEXT,
    "format" TEXT,
    "maxCharsPerLine" INTEGER,
    "burnIn" BOOLEAN,
    "sourceText" TEXT,
    "audioDurationSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_media_node_configs_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "workflow_branch_node_configs" (
    "nodeId" TEXT NOT NULL,
    "mode" TEXT,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_branch_node_configs_pkey" PRIMARY KEY ("nodeId")
);

-- AddForeignKey
ALTER TABLE "workflow_text_node_configs" ADD CONSTRAINT "workflow_text_node_configs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "workflow_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_translation_node_configs" ADD CONSTRAINT "workflow_translation_node_configs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "workflow_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_image_node_configs" ADD CONSTRAINT "workflow_image_node_configs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "workflow_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_media_node_configs" ADD CONSTRAINT "workflow_media_node_configs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "workflow_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_branch_node_configs" ADD CONSTRAINT "workflow_branch_node_configs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "workflow_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from existing config JSON (JSON stays as the transition fallback).
INSERT INTO "workflow_text_node_configs" ("nodeId","laneId","channel","provider","model","temperature","maxTokens","outputFormat","tone","textLength","summaryLength","sourceNodeRef","contentStyle","searchType","customPrompt","updatedAt")
SELECT n."nodeId",
  NULLIF(BTRIM(n."config"->>'laneId'), ''), NULLIF(BTRIM(n."config"->>'channel'), ''),
  NULLIF(BTRIM(n."config"->>'provider'), ''), NULLIF(BTRIM(n."config"->>'model'), ''),
  CASE WHEN jsonb_typeof(n."config"->'temperature') = 'number' THEN (n."config"->>'temperature')::double precision END,
  CASE WHEN jsonb_typeof(n."config"->'maxTokens') = 'number' THEN ROUND((n."config"->>'maxTokens')::numeric)::int END,
  NULLIF(BTRIM(n."config"->>'outputFormat'), ''), NULLIF(BTRIM(n."config"->>'tone'), ''),
  NULLIF(BTRIM(n."config"->>'textLength'), ''), NULLIF(BTRIM(n."config"->>'summaryLength'), ''),
  NULLIF(BTRIM(n."config"->>'sourceNodeRef'), ''), NULLIF(BTRIM(n."config"->>'contentStyle'), ''),
  NULLIF(BTRIM(n."config"->>'searchType'), ''), NULLIF(BTRIM(n."config"->>'customPrompt'), ''),
  CURRENT_TIMESTAMP
FROM "workflow_nodes" n
WHERE n."type"::text IN ('text_generation','keyword_planner','summarization','adapt','intelligence');

INSERT INTO "workflow_translation_node_configs" ("nodeId","laneId","provider","model","sourceLanguage","targetLanguage","formalityLevel","preserveFormatting","updatedAt")
SELECT n."nodeId",
  NULLIF(BTRIM(n."config"->>'laneId'), ''), NULLIF(BTRIM(n."config"->>'provider'), ''),
  NULLIF(BTRIM(n."config"->>'model'), ''), NULLIF(BTRIM(n."config"->>'sourceLanguage'), ''),
  NULLIF(BTRIM(n."config"->>'targetLanguage'), ''), NULLIF(BTRIM(n."config"->>'formalityLevel'), ''),
  CASE WHEN jsonb_typeof(n."config"->'preserveFormatting') = 'boolean' THEN (n."config"->>'preserveFormatting')::boolean END,
  CURRENT_TIMESTAMP
FROM "workflow_nodes" n
WHERE n."type"::text = 'translation';

INSERT INTO "workflow_image_node_configs" ("nodeId","laneId","channel","provider","model","size","quality","style","template","designStyle","aspectRatio","negativePrompt","updatedAt")
SELECT n."nodeId",
  NULLIF(BTRIM(n."config"->>'laneId'), ''), NULLIF(BTRIM(n."config"->>'channel'), ''),
  NULLIF(BTRIM(n."config"->>'provider'), ''), NULLIF(BTRIM(n."config"->>'model'), ''),
  NULLIF(BTRIM(n."config"->>'size'), ''), NULLIF(BTRIM(n."config"->>'quality'), ''),
  NULLIF(BTRIM(n."config"->>'style'), ''), NULLIF(BTRIM(n."config"->>'template'), ''),
  NULLIF(BTRIM(n."config"->>'designStyle'), ''), NULLIF(BTRIM(n."config"->>'aspectRatio'), ''),
  NULLIF(BTRIM(n."config"->>'negativePrompt'), ''),
  CURRENT_TIMESTAMP
FROM "workflow_nodes" n
WHERE n."type"::text = 'image_generation';

INSERT INTO "workflow_media_node_configs" ("nodeId","laneId","provider","model","sourceType","language","sourceUrl","format","maxCharsPerLine","burnIn","sourceText","audioDurationSeconds","updatedAt")
SELECT n."nodeId",
  NULLIF(BTRIM(n."config"->>'laneId'), ''), NULLIF(BTRIM(n."config"->>'provider'), ''),
  NULLIF(BTRIM(n."config"->>'model'), ''), NULLIF(BTRIM(n."config"->>'sourceType'), ''),
  NULLIF(BTRIM(n."config"->>'language'), ''), NULLIF(BTRIM(n."config"->>'sourceUrl'), ''),
  NULLIF(BTRIM(n."config"->>'format'), ''),
  CASE WHEN jsonb_typeof(n."config"->'maxCharsPerLine') = 'number' THEN ROUND((n."config"->>'maxCharsPerLine')::numeric)::int END,
  CASE WHEN jsonb_typeof(n."config"->'burnIn') = 'boolean' THEN (n."config"->>'burnIn')::boolean END,
  NULLIF(BTRIM(n."config"->>'sourceText'), ''),
  CASE WHEN jsonb_typeof(n."config"->'audioDurationSeconds') = 'number' THEN (n."config"->>'audioDurationSeconds')::double precision END,
  CURRENT_TIMESTAMP
FROM "workflow_nodes" n
WHERE n."type"::text IN ('transcription','subtitle');

INSERT INTO "workflow_branch_node_configs" ("nodeId","mode","channels","updatedAt")
SELECT n."nodeId",
  NULLIF(BTRIM(n."config"->>'mode'), ''),
  CASE WHEN jsonb_typeof(n."config"->'channels') = 'array'
       THEN ARRAY(SELECT BTRIM(e.v) FROM jsonb_array_elements_text(n."config"->'channels') AS e(v) WHERE BTRIM(e.v) <> '')
       ELSE ARRAY[]::TEXT[] END,
  CURRENT_TIMESTAMP
FROM "workflow_nodes" n
WHERE n."type"::text = 'branch';