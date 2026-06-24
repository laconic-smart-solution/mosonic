-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserPlanStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "WorkflowNodeType" AS ENUM ('keyword_planner', 'text_generation', 'image_generation', 'video_generation', 'translation', 'transcription', 'summarization', 'branch', 'adapt', 'merge', 'intelligence');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('running', 'completed', 'failed', 'paused');

-- CreateEnum
CREATE TYPE "PipelineExecutionMode" AS ENUM ('inline', 'queue');

-- CreateEnum
CREATE TYPE "PipelineNodeExecutionStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('pending', 'running', 'partial', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('pending', 'scheduled', 'published', 'failed', 'cancelled', 'partial');

-- CreateEnum
CREATE TYPE "PostAnalyticsSyncStatus" AS ENUM ('pending', 'synced', 'partial', 'unavailable');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('generating', 'ready', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('processing', 'active', 'archived', 'failed');

-- CreateEnum
CREATE TYPE "CreditTopupSource" AS ENUM ('self_serve', 'admin');

-- CreateEnum
CREATE TYPE "CreditTopupPurchaseStatus" AS ENUM ('pending', 'active', 'cancelled');

-- CreateEnum
CREATE TYPE "ServiceRateType" AS ENUM ('text', 'image', 'video');

-- CreateEnum
CREATE TYPE "CostEntryType" AS ENUM ('openai_llm', 'openai_image', 'openai_video', 'zernio_account');

-- CreateEnum
CREATE TYPE "BudgetOnLimitHit" AS ENUM ('warn', 'stop');

-- CreateEnum
CREATE TYPE "CampaignContentPromptStrategy" AS ENUM ('fixed', 'rotate', 'ai_calendar');

-- CreateEnum
CREATE TYPE "CampaignAutonomyMode" AS ENUM ('off', 'review_optional', 'full_auto');

-- CreateEnum
CREATE TYPE "PipelineLogLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "PipelineLogStatus" AS ENUM ('started', 'completed', 'retrying', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "userId" TEXT NOT NULL,
    "authServerUserId" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "zernioProfileId" TEXT,
    "zernioConnectedAccounts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "plans" (
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceThb" DOUBLE PRECISION NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "creditsPerMonth" INTEGER,
    "creditsOverride" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("planId")
);

-- CreateTable
CREATE TABLE "user_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "creditsPerMonth" INTEGER NOT NULL,
    "billingPeriod" TIMESTAMP(3) NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsRemaining" INTEGER NOT NULL,
    "status" "UserPlanStatus" NOT NULL DEFAULT 'active',
    "lowBalanceNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_config" (
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "creditPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "marginTarget" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "basicUsersPerMonth" INTEGER NOT NULL DEFAULT 50,
    "overheadFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "derivedMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "changeHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_config_pkey" PRIMARY KEY ("singletonKey")
);

-- CreateTable
CREATE TABLE "fixed_costs" (
    "fixedCostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_costs_pkey" PRIMARY KEY ("fixedCostId")
);

-- CreateTable
CREATE TABLE "service_rates" (
    "serviceRateId" TEXT NOT NULL,
    "serviceType" "ServiceRateType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "avgPricePerCall" DOUBLE PRECISION,
    "pricePerImage" DOUBLE PRECISION,
    "pricePerSecond" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_rates_pkey" PRIMARY KEY ("serviceRateId")
);

-- CreateTable
CREATE TABLE "node_credit_prices" (
    "nodeCreditPriceId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_credit_prices_pkey" PRIMARY KEY ("nodeCreditPriceId")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pipelineRef" TEXT NOT NULL,
    "campaignRef" TEXT,
    "contentRef" TEXT,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'openai',
    "rawCostUsd" DOUBLE PRECISION NOT NULL,
    "overheadUsd" DOUBLE PRECISION NOT NULL,
    "marginAppliedUsd" DOUBLE PRECISION NOT NULL,
    "creditPriceUsdSnapshot" DOUBLE PRECISION NOT NULL,
    "creditsCharged" DOUBLE PRECISION NOT NULL,
    "billingPeriod" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_topups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "credits" DOUBLE PRECISION NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "CreditTopupSource" NOT NULL DEFAULT 'self_serve',
    "adminUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_topup_purchases" (
    "topupPurchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'THB',
    "transactionId" TEXT NOT NULL,
    "status" "CreditTopupPurchaseStatus" NOT NULL DEFAULT 'pending',
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_topup_purchases_pkey" PRIMARY KEY ("topupPurchaseId")
);

-- CreateTable
CREATE TABLE "workflows" (
    "workflowId" TEXT NOT NULL,
    "userId" TEXT,
    "ruleRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "edges" JSONB NOT NULL DEFAULT '[]',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "versions" JSONB NOT NULL DEFAULT '[]',
    "status" "WorkflowStatus" NOT NULL DEFAULT 'generating',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("workflowId")
);

-- CreateTable
CREATE TABLE "workflow_nodes" (
    "nodeId" TEXT NOT NULL,
    "workflowRef" TEXT NOT NULL,
    "userId" TEXT,
    "type" "WorkflowNodeType" NOT NULL,
    "order" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "userPrompt" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lane" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_nodes_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "rules" (
    "ruleId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "brand" JSONB NOT NULL DEFAULT '{}',
    "audience" JSONB NOT NULL DEFAULT '{}',
    "campaign" JSONB NOT NULL DEFAULT '{}',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "contentGuidelines" JSONB NOT NULL DEFAULT '{}',
    "originalInput" JSONB NOT NULL DEFAULT '{}',
    "status" "RuleStatus" NOT NULL DEFAULT 'active',
    "versions" JSONB NOT NULL DEFAULT '[]',
    "approvalPolicy" JSONB NOT NULL DEFAULT '[]',
    "autonomyPolicy" JSONB,
    "newsTrigger" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("ruleId")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "pipelineId" TEXT NOT NULL,
    "userId" TEXT,
    "workflowRef" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "contentPrompt" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "status" "PipelineStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "pausedNodeId" TEXT,
    "pausedLaneId" TEXT,
    "executionMode" "PipelineExecutionMode" NOT NULL DEFAULT 'inline',
    "graph" JSONB NOT NULL DEFAULT '{}',
    "ruleOverlay" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "creditsCharged" INTEGER DEFAULT 0,
    "creditChargeBreakdown" JSONB,
    "creditsReconciled" BOOLEAN DEFAULT false,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("pipelineId")
);

-- CreateTable
CREATE TABLE "pipeline_logs" (
    "logId" TEXT NOT NULL,
    "pipelineRef" TEXT NOT NULL,
    "workflowRef" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" "WorkflowNodeType" NOT NULL,
    "order" INTEGER,
    "level" "PipelineLogLevel" NOT NULL,
    "status" "PipelineLogStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_logs_pkey" PRIMARY KEY ("logId")
);

-- CreateTable
CREATE TABLE "contents" (
    "contentId" TEXT NOT NULL,
    "userId" TEXT,
    "pipelineRef" TEXT NOT NULL,
    "workflowRef" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "outputs" JSONB NOT NULL DEFAULT '{}',
    "userEdits" JSONB NOT NULL DEFAULT '{}',
    "nodePromptOverrides" JSONB NOT NULL DEFAULT '{}',
    "nodeOutputs" JSONB NOT NULL DEFAULT '{}',
    "nodeUserEdits" JSONB NOT NULL DEFAULT '{}',
    "laneOutputs" JSONB NOT NULL DEFAULT '{}',
    "currentVersion" INTEGER,
    "versions" JSONB,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "approval" JSONB NOT NULL DEFAULT '{}',
    "variantId" TEXT,
    "experimentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "uploads" (
    "uploadId" TEXT NOT NULL,
    "userId" TEXT,
    "contentRef" TEXT NOT NULL,
    "workflowRef" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "status" "UploadStatus" NOT NULL DEFAULT 'pending',
    "resolvedOutputs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("uploadId")
);

-- CreateTable
CREATE TABLE "posts" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadRef" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "contentRef" TEXT NOT NULL,
    "zernioPostId" TEXT,
    "channels" TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" "PostStatus" NOT NULL DEFAULT 'pending',
    "platformResults" JSONB NOT NULL DEFAULT '[]',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "publishedNow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "post_analytics" (
    "postId" TEXT NOT NULL,
    "zernioPostId" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syncStatus" "PostAnalyticsSyncStatus" NOT NULL DEFAULT 'pending',
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "period" JSONB NOT NULL,
    "platformMetrics" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_analytics_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "analytics" (
    "analyticsId" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "period" JSONB NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "contentPerformance" JSONB NOT NULL DEFAULT '[]',
    "campaignSummary" JSONB NOT NULL DEFAULT '{}',
    "feedbackSignal" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("analyticsId")
);

-- CreateTable
CREATE TABLE "cost_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pipelineRef" TEXT NOT NULL,
    "campaignRef" TEXT NOT NULL,
    "contentRef" TEXT,
    "nodeId" TEXT,
    "nodeType" TEXT,
    "provider" TEXT NOT NULL,
    "providerModel" TEXT,
    "entryType" "CostEntryType" NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "imageSize" TEXT,
    "imageQuality" TEXT,
    "videoSeconds" INTEGER NOT NULL DEFAULT 0,
    "videoResolution" TEXT,
    "accountCount" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "billingPeriod" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_settings" (
    "userId" TEXT NOT NULL,
    "monthlyLimitUsd" DOUBLE PRECISION,
    "warningThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "onMonthlyLimitHit" "BudgetOnLimitHit" NOT NULL DEFAULT 'warn',
    "perRunLimitUsd" DOUBLE PRECISION,
    "onRunLimitHit" "BudgetOnLimitHit" NOT NULL DEFAULT 'stop',
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "inAppAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "campaign_schedules" (
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "workflowTemplateId" TEXT,
    "workflowRef" TEXT,
    "contentPromptStrategy" "CampaignContentPromptStrategy" NOT NULL DEFAULT 'fixed',
    "contentPrompts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastPipelineId" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_schedules_pkey" PRIMARY KEY ("scheduleId")
);

-- CreateTable
CREATE TABLE "campaign_autonomy_policies" (
    "policyId" TEXT NOT NULL,
    "ruleRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "CampaignAutonomyMode" NOT NULL DEFAULT 'off',
    "allowedChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPostsPerDay" INTEGER NOT NULL DEFAULT 5,
    "quietHours" JSONB,
    "blockIfPendingSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_autonomy_policies_pkey" PRIMARY KEY ("policyId")
);

-- CreateTable
CREATE TABLE "news_trigger_logs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "ruleId" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "articlesFetched" INTEGER NOT NULL DEFAULT 0,
    "topArticlesPicked" INTEGER NOT NULL DEFAULT 0,
    "rulesChecked" INTEGER NOT NULL DEFAULT 0,
    "rulesMatched" INTEGER NOT NULL DEFAULT 0,
    "pipelinesTriggered" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_trigger_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_api_keys" (
    "keyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['pipeline:start']::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_api_keys_pkey" PRIMARY KEY ("keyId")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("subscriptionId")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "deliveryId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("deliveryId")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "sync_locks" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_authServerUserId_key" ON "users"("authServerUserId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "plans_name_idx" ON "plans"("name");

-- CreateIndex
CREATE INDEX "plans_isActive_idx" ON "plans"("isActive");

-- CreateIndex
CREATE INDEX "user_plans_userId_idx" ON "user_plans"("userId");

-- CreateIndex
CREATE INDEX "user_plans_planId_idx" ON "user_plans"("planId");

-- CreateIndex
CREATE INDEX "user_plans_status_idx" ON "user_plans"("status");

-- CreateIndex
CREATE INDEX "user_plans_userId_status_idx" ON "user_plans"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_rates_serviceType_provider_model_key" ON "service_rates"("serviceType", "provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "node_credit_prices_nodeType_key" ON "node_credit_prices"("nodeType");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_billingPeriod_idx" ON "credit_ledger"("userId", "billingPeriod");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_createdAt_idx" ON "credit_ledger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "credit_ledger_pipelineRef_idx" ON "credit_ledger"("pipelineRef");

-- CreateIndex
CREATE INDEX "credit_topups_userId_createdAt_idx" ON "credit_topups"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "credit_topups_adminUserId_idx" ON "credit_topups"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_topup_purchases_transactionId_key" ON "credit_topup_purchases"("transactionId");

-- CreateIndex
CREATE INDEX "credit_topup_purchases_userId_purchaseDate_idx" ON "credit_topup_purchases"("userId", "purchaseDate" DESC);

-- CreateIndex
CREATE INDEX "credit_topup_purchases_status_idx" ON "credit_topup_purchases"("status");

-- CreateIndex
CREATE INDEX "workflows_ruleRef_status_idx" ON "workflows"("ruleRef", "status");

-- CreateIndex
CREATE INDEX "workflows_isTemplate_templateName_idx" ON "workflows"("isTemplate", "templateName");

-- CreateIndex
CREATE INDEX "workflows_userId_updatedAt_idx" ON "workflows"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "workflow_nodes_workflowRef_order_idx" ON "workflow_nodes"("workflowRef", "order");

-- CreateIndex
CREATE INDEX "workflow_nodes_userId_workflowRef_idx" ON "workflow_nodes"("userId", "workflowRef");

-- CreateIndex
CREATE INDEX "rules_name_idx" ON "rules"("name");

-- CreateIndex
CREATE INDEX "rules_status_updatedAt_idx" ON "rules"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "rules_userId_updatedAt_idx" ON "rules"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "pipelines_workflowRef_status_idx" ON "pipelines"("workflowRef", "status");

-- CreateIndex
CREATE INDEX "pipelines_ruleRef_startedAt_idx" ON "pipelines"("ruleRef", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "pipelines_userId_startedAt_idx" ON "pipelines"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "pipeline_logs_pipelineRef_timestamp_idx" ON "pipeline_logs"("pipelineRef", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "pipeline_logs_expiresAt_idx" ON "pipeline_logs"("expiresAt");

-- CreateIndex
CREATE INDEX "contents_workflowRef_status_idx" ON "contents"("workflowRef", "status");

-- CreateIndex
CREATE INDEX "contents_ruleRef_updatedAt_idx" ON "contents"("ruleRef", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "contents_userId_updatedAt_idx" ON "contents"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "contents_pipelineRef_idx" ON "contents"("pipelineRef");

-- CreateIndex
CREATE INDEX "uploads_contentRef_status_idx" ON "uploads"("contentRef", "status");

-- CreateIndex
CREATE INDEX "uploads_userId_createdAt_idx" ON "uploads"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_uploadRef_status_idx" ON "posts"("uploadRef", "status");

-- CreateIndex
CREATE INDEX "posts_userId_createdAt_idx" ON "posts"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_userId_status_idx" ON "posts"("userId", "status");

-- CreateIndex
CREATE INDEX "posts_ruleRef_createdAt_idx" ON "posts"("ruleRef", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_zernioPostId_idx" ON "posts"("zernioPostId");

-- CreateIndex
CREATE INDEX "posts_status_scheduledAt_idx" ON "posts"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "post_analytics_zernioPostId_idx" ON "post_analytics"("zernioPostId");

-- CreateIndex
CREATE INDEX "post_analytics_ruleRef_pulledAt_idx" ON "post_analytics"("ruleRef", "pulledAt" DESC);

-- CreateIndex
CREATE INDEX "post_analytics_userId_idx" ON "post_analytics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_ruleRef_key" ON "analytics"("ruleRef");

-- CreateIndex
CREATE INDEX "cost_entries_userId_billingPeriod_idx" ON "cost_entries"("userId", "billingPeriod");

-- CreateIndex
CREATE INDEX "cost_entries_userId_pipelineRef_idx" ON "cost_entries"("userId", "pipelineRef");

-- CreateIndex
CREATE INDEX "cost_entries_userId_campaignRef_idx" ON "cost_entries"("userId", "campaignRef");

-- CreateIndex
CREATE INDEX "campaign_schedules_userId_idx" ON "campaign_schedules"("userId");

-- CreateIndex
CREATE INDEX "campaign_schedules_ruleRef_idx" ON "campaign_schedules"("ruleRef");

-- CreateIndex
CREATE INDEX "campaign_schedules_enabled_nextRunAt_idx" ON "campaign_schedules"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_autonomy_policies_ruleRef_key" ON "campaign_autonomy_policies"("ruleRef");

-- CreateIndex
CREATE INDEX "campaign_autonomy_policies_userId_idx" ON "campaign_autonomy_policies"("userId");

-- CreateIndex
CREATE INDEX "integration_api_keys_userId_idx" ON "integration_api_keys"("userId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_userId_idx" ON "webhook_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_subscriptionId_idx" ON "webhook_deliveries"("subscriptionId");

-- AddForeignKey
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("planId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_workflowRef_fkey" FOREIGN KEY ("workflowRef") REFERENCES "workflows"("workflowId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "webhook_subscriptions"("subscriptionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active user plan per user (partial unique index, matches legacy Mongo behavior)
CREATE UNIQUE INDEX "user_plans_one_active_per_user" ON "user_plans"("userId") WHERE "status" = 'active';
