import PageLoader from "@/components/core/page-loader"
import { lazy } from "react"

export const HomePage         = PageLoader(lazy(() => import("@/features/home/pages/home")))
export const DashboardPage    = PageLoader(lazy(() => import("@/features/dashboard/pages/dashboard")))
export const RulesPage        = PageLoader(lazy(() => import("@/features/rules/pages/rules")))
export const NewsTriggerPage  = PageLoader(lazy(() => import("@/features/rules/pages/news-trigger")))
export const WorkflowPage       = PageLoader(lazy(() => import("@/features/workflow/pages/workflow")))
export const WorkflowsListPage  = PageLoader(lazy(() => import("@/features/workflow/pages/workflows")))
export const PipelinesPage      = PageLoader(lazy(() => import("@/features/pipeline/pages/pipelines")))
export const ContentPage      = PageLoader(lazy(() => import("@/features/content/pages/content")))
export const ContentDetailPage = PageLoader(lazy(() => import("@/features/content/pages/content-detail")))
export const UploadPage       = PageLoader(lazy(() => import("@/features/upload/pages/upload")))
export const PostsPage        = PageLoader(lazy(() => import("@/features/posts/pages/posts-page")))
export const PostDetailPage   = PageLoader(lazy(() => import("@/features/posts/pages/post-detail-page")))
export const SettingsAccountsPage = PageLoader(
  lazy(() => import("@/features/settings/pages/settings-accounts")),
)
export const UsageBillingLayout = PageLoader(
  lazy(() => import("@/features/usage/pages/usage-billing-layout")),
)
export const UsageOverviewPage = PageLoader(
  lazy(() => import("@/features/usage/pages/usage-overview-page")),
)
export const UsageTopupPage = PageLoader(
  lazy(() => import("@/features/usage/pages/usage-topup-page")),
)
export const UsagePlansPage = PageLoader(
  lazy(() => import("@/features/usage/pages/usage-plans-page")),
)
export const LandingPage = PageLoader(lazy(() => import("@/features/marketing/pages/landing")))
export const PricingPage = PageLoader(lazy(() => import("@/features/marketing/pages/pricing")))
export const MarketingFaqPage = PageLoader(lazy(() => import("@/features/marketing/pages/faq")))

export const LoginPage = PageLoader(lazy(() => import("@/features/auth/pages/login")))
export const SignupPage = PageLoader(lazy(() => import("@/features/auth/pages/signup")))
export const ForgotPasswordPage = PageLoader(
  lazy(() => import("@/features/auth/pages/forgot-password")),
)
export const VerifyOtpPage = PageLoader(lazy(() => import("@/features/auth/pages/verify-otp")))
export const VerifyOriginPage = PageLoader(
  lazy(() => import("@/features/auth/pages/verify-origin")),
)
export const ResetPasswordPage = PageLoader(
  lazy(() => import("@/features/auth/pages/reset-password")),
)
export const AdminDashboardPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-dashboard")))
export const AdminUsersPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-users")))
export const AdminUserDetailPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-user-detail")))
export const AdminCostPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-cost")))
export const AdminCreditConfigPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-credit-config")),
)
export const AdminNodeCreditsPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-node-credits")),
)
export const AdminPlansPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-plans")))
export const AdminTopupPlansPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-topup-plans")),
)
export const AdminUsagePage = PageLoader(lazy(() => import("@/features/admin/pages/admin-usage")))
export const AdminApiUsagePage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-api-usage")),
)
export const AdminContentPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-content")))
export const AdminContentDetailPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-content-detail")),
)
export const AdminFaqPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-faq-page")))
export const AdminFaqDocumentDetailPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-faq-document-detail")),
)
export const AdminLinePage = PageLoader(lazy(() => import("@/features/admin/pages/admin-line")))
export const AdminAnnouncementsPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-announcements")),
)

export const AnnouncementsPage = PageLoader(
  lazy(() => import("@/features/announcements/pages/announcements-page")),
)

export const SuspendedPage = PageLoader(lazy(() => import("@/features/error/pages/suspended")))
export const NotFoundPage = PageLoader(lazy(() => import("@/features/error/pages/not-found")))
