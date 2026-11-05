-- Migrate saved workflow template nodes from legacy `video_generation` by
-- config.mode: 'presenter' -> video_presenter (HeyGen); anything else
-- (cinematic / missing) -> video_cinematic (Sora). config.mode is pinned to
-- match so mode-based readers keep working.
--
-- Pipeline run snapshots (pipelines.nodes JSON) and pipeline_logs keep the
-- legacy value: the server still executes `video_generation` using config.mode.
UPDATE "workflow_nodes"
SET "type" = 'video_presenter',
    "config" = jsonb_set(COALESCE("config"::jsonb, '{}'::jsonb), '{mode}', '"presenter"'::jsonb)
WHERE "type" = 'video_generation'
  AND COALESCE("config"::jsonb ->> 'mode', '') = 'presenter';

UPDATE "workflow_nodes"
SET "type" = 'video_cinematic',
    "config" = jsonb_set(COALESCE("config"::jsonb, '{}'::jsonb), '{mode}', '"cinematic"'::jsonb)
WHERE "type" = 'video_generation';
