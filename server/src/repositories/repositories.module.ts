import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import {
  ANALYTICS_REPOSITORY,
  ANNOUNCEMENT_REPOSITORY,
  BUDGET_SETTINGS_REPOSITORY,
  CAMPAIGN_AUTONOMY_POLICY_REPOSITORY,
  CAMPAIGN_SCHEDULE_REPOSITORY,
  CHAT_MESSAGE_REPOSITORY,
  CHAT_SESSION_REPOSITORY,
  CONTENT_REPOSITORY,
  COST_ENTRY_REPOSITORY,
  CREDIT_CONFIG_REPOSITORY,
  CREDIT_LEDGER_REPOSITORY,
  CREDIT_TOPUP_PURCHASE_REPOSITORY,
  CREDIT_TOPUP_REPOSITORY,
  PLAN_PURCHASE_REPOSITORY,
  FIXED_COST_REPOSITORY,
  INTEGRATION_API_KEY_REPOSITORY,
  NEWS_TRIGGER_LOG_REPOSITORY,
  LLM_TOKEN_RATE_REPOSITORY,
  NODE_CREDIT_PRICE_REPOSITORY,
  PIPELINE_LOG_REPOSITORY,
  PIPELINE_REPOSITORY,
  PLAN_REPOSITORY,
  POST_ANALYTICS_REPOSITORY,
  POST_REPOSITORY,
  RULE_REPOSITORY,
  RULE_ASSET_REPOSITORY,
  RULE_MEMORY_REPOSITORY,
  SERVICE_RATE_REPOSITORY,
  SYNC_LOCK_REPOSITORY,
  UPLOAD_REPOSITORY,
  USER_PLAN_REPOSITORY,
  USER_REPOSITORY,
  SOCIAL_ACCOUNT_REPOSITORY,
  WEBHOOK_DELIVERY_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
  WEBHOOK_SUBSCRIPTION_REPOSITORY,
  WORKFLOW_NODE_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from './tokens';
import { PrismaAnalyticsRepository } from './prisma/prisma-analytics.repository';
import { PrismaAnnouncementRepository } from './prisma/prisma-announcement.repository';
import { PrismaBudgetSettingsRepository } from './prisma/prisma-budget-settings.repository';
import { PrismaCampaignAutonomyPolicyRepository } from './prisma/prisma-campaign-autonomy-policy.repository';
import { PrismaCampaignScheduleRepository } from './prisma/prisma-campaign-schedule.repository';
import { PrismaChatMessageRepository } from './prisma/prisma-chat-message.repository';
import { PrismaChatSessionRepository } from './prisma/prisma-chat-session.repository';
import { PrismaContentRepository } from './prisma/prisma-content.repository';
import { PrismaCostEntryRepository } from './prisma/prisma-cost-entry.repository';
import { PrismaCreditConfigRepository } from './prisma/prisma-credit-config.repository';
import { PrismaCreditLedgerRepository } from './prisma/prisma-credit-ledger.repository';
import { PrismaCreditTopupPurchaseRepository } from './prisma/prisma-credit-topup-purchase.repository';
import { PrismaCreditTopupRepository } from './prisma/prisma-credit-topup.repository';
import { PrismaPlanPurchaseRepository } from './prisma/prisma-plan-purchase.repository';
import { PrismaFixedCostRepository } from './prisma/prisma-fixed-cost.repository';
import { PrismaIntegrationApiKeyRepository } from './prisma/prisma-integration-api-key.repository';
import { PrismaNewsTriggerLogRepository } from './prisma/prisma-news-trigger-log.repository';
import { PrismaLlmTokenRateRepository } from './prisma/prisma-llm-token-rate.repository';
import { PrismaNodeCreditPriceRepository } from './prisma/prisma-node-credit-price.repository';
import { PrismaPipelineLogRepository } from './prisma/prisma-pipeline-log.repository';
import { PrismaPipelineRepository } from './prisma/prisma-pipeline.repository';
import { PrismaPlanRepository } from './prisma/prisma-plan.repository';
import { PrismaPostAnalyticsRepository } from './prisma/prisma-post-analytics.repository';
import { PrismaPostRepository } from './prisma/prisma-post.repository';
import { PrismaRuleRepository } from './prisma/prisma-rule.repository';
import { PrismaRuleAssetRepository } from './prisma/prisma-rule-asset.repository';
import { PrismaRuleMemoryRepository } from './prisma/prisma-rule-memory.repository';
import { PrismaServiceRateRepository } from './prisma/prisma-service-rate.repository';
import { PrismaSyncLockRepository } from './prisma/prisma-sync-lock.repository';
import { PrismaUploadRepository } from './prisma/prisma-upload.repository';
import { PrismaUserPlanRepository } from './prisma/prisma-user-plan.repository';
import { PrismaUserRepository } from './prisma/prisma-user.repository';
import { PrismaSocialAccountRepository } from './prisma/prisma-social-account.repository';
import { PrismaWebhookDeliveryRepository } from './prisma/prisma-webhook-delivery.repository';
import { PrismaWebhookEventRepository } from './prisma/prisma-webhook-event.repository';
import { PrismaWebhookSubscriptionRepository } from './prisma/prisma-webhook-subscription.repository';
import { PrismaWorkflowNodeRepository } from './prisma/prisma-workflow-node.repository';
import { PrismaWorkflowRepository } from './prisma/prisma-workflow.repository';

const repositoryProviders = [
  { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  {
    provide: SOCIAL_ACCOUNT_REPOSITORY,
    useClass: PrismaSocialAccountRepository,
  },
  { provide: PLAN_REPOSITORY, useClass: PrismaPlanRepository },
  { provide: USER_PLAN_REPOSITORY, useClass: PrismaUserPlanRepository },
  { provide: CREDIT_CONFIG_REPOSITORY, useClass: PrismaCreditConfigRepository },
  { provide: FIXED_COST_REPOSITORY, useClass: PrismaFixedCostRepository },
  { provide: SERVICE_RATE_REPOSITORY, useClass: PrismaServiceRateRepository },
  {
    provide: NODE_CREDIT_PRICE_REPOSITORY,
    useClass: PrismaNodeCreditPriceRepository,
  },
  {
    provide: LLM_TOKEN_RATE_REPOSITORY,
    useClass: PrismaLlmTokenRateRepository,
  },
  { provide: CREDIT_LEDGER_REPOSITORY, useClass: PrismaCreditLedgerRepository },
  { provide: CREDIT_TOPUP_REPOSITORY, useClass: PrismaCreditTopupRepository },
  {
    provide: CREDIT_TOPUP_PURCHASE_REPOSITORY,
    useClass: PrismaCreditTopupPurchaseRepository,
  },
  {
    provide: PLAN_PURCHASE_REPOSITORY,
    useClass: PrismaPlanPurchaseRepository,
  },
  { provide: WORKFLOW_REPOSITORY, useClass: PrismaWorkflowRepository },
  { provide: WORKFLOW_NODE_REPOSITORY, useClass: PrismaWorkflowNodeRepository },
  { provide: RULE_REPOSITORY, useClass: PrismaRuleRepository },
  { provide: RULE_ASSET_REPOSITORY, useClass: PrismaRuleAssetRepository },
  { provide: RULE_MEMORY_REPOSITORY, useClass: PrismaRuleMemoryRepository },
  { provide: PIPELINE_REPOSITORY, useClass: PrismaPipelineRepository },
  { provide: PIPELINE_LOG_REPOSITORY, useClass: PrismaPipelineLogRepository },
  { provide: CONTENT_REPOSITORY, useClass: PrismaContentRepository },
  { provide: UPLOAD_REPOSITORY, useClass: PrismaUploadRepository },
  { provide: POST_REPOSITORY, useClass: PrismaPostRepository },
  {
    provide: POST_ANALYTICS_REPOSITORY,
    useClass: PrismaPostAnalyticsRepository,
  },
  { provide: ANALYTICS_REPOSITORY, useClass: PrismaAnalyticsRepository },
  { provide: COST_ENTRY_REPOSITORY, useClass: PrismaCostEntryRepository },
  {
    provide: BUDGET_SETTINGS_REPOSITORY,
    useClass: PrismaBudgetSettingsRepository,
  },
  {
    provide: CAMPAIGN_SCHEDULE_REPOSITORY,
    useClass: PrismaCampaignScheduleRepository,
  },
  {
    provide: CAMPAIGN_AUTONOMY_POLICY_REPOSITORY,
    useClass: PrismaCampaignAutonomyPolicyRepository,
  },
  { provide: CHAT_SESSION_REPOSITORY, useClass: PrismaChatSessionRepository },
  { provide: CHAT_MESSAGE_REPOSITORY, useClass: PrismaChatMessageRepository },
  {
    provide: NEWS_TRIGGER_LOG_REPOSITORY,
    useClass: PrismaNewsTriggerLogRepository,
  },
  {
    provide: INTEGRATION_API_KEY_REPOSITORY,
    useClass: PrismaIntegrationApiKeyRepository,
  },
  {
    provide: WEBHOOK_SUBSCRIPTION_REPOSITORY,
    useClass: PrismaWebhookSubscriptionRepository,
  },
  {
    provide: WEBHOOK_DELIVERY_REPOSITORY,
    useClass: PrismaWebhookDeliveryRepository,
  },
  { provide: WEBHOOK_EVENT_REPOSITORY, useClass: PrismaWebhookEventRepository },
  { provide: SYNC_LOCK_REPOSITORY, useClass: PrismaSyncLockRepository },
  { provide: ANNOUNCEMENT_REPOSITORY, useClass: PrismaAnnouncementRepository },
];

@Module({
  imports: [DatabaseModule],
  providers: repositoryProviders,
  exports: repositoryProviders.map((p) => p.provide),
})
export class RepositoriesModule {}
