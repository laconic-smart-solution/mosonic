-- Split video node into HeyGen presenter and Sora cinematic node types.
-- Enum values are added in their own migration so the data migration below
-- runs after this commit (Postgres cannot use a new enum value in the same
-- transaction that added it).
ALTER TYPE "WorkflowNodeType" ADD VALUE IF NOT EXISTS 'video_presenter';
ALTER TYPE "WorkflowNodeType" ADD VALUE IF NOT EXISTS 'video_cinematic';
