-- Rename infrastructure execution mode to dispatchMode
ALTER TYPE "PipelineExecutionMode" RENAME TO "PipelineDispatchMode";
ALTER TABLE "pipelines" RENAME COLUMN "executionMode" TO "dispatchMode";

-- User review policy: auto | step
CREATE TYPE "PipelineUserExecutionMode" AS ENUM ('auto', 'step');
ALTER TABLE "pipelines" ADD COLUMN "executionMode" "PipelineUserExecutionMode" NOT NULL DEFAULT 'auto';

-- Node status for deliberate post-success review pause
ALTER TYPE "PipelineNodeExecutionStatus" ADD VALUE IF NOT EXISTS 'waiting_review';
