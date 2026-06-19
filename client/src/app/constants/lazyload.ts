import PageLoader from "@/components/core/page-loader"
import { lazy } from "react"

export const HomePage         = PageLoader(lazy(() => import("@/features/home/pages/home")))
export const DashboardPage    = PageLoader(lazy(() => import("@/features/dashboard/pages/dashboard")))
export const RulesPage        = PageLoader(lazy(() => import("@/features/rules/pages/rules")))
export const NewsTriggerPage  = PageLoader(lazy(() => import("@/features/rules/pages/news-trigger")))
export const WorkflowPromptPage = PageLoader(lazy(() => import("@/features/workflow/pages/workflow-prompt")))
export const WorkflowPage       = PageLoader(lazy(() => import("@/features/workflow/pages/workflow")))
export const WorkflowsListPage  = PageLoader(lazy(() => import("@/features/workflow/pages/workflows")))
export const PipelinesPage      = PageLoader(lazy(() => import("@/features/pipeline/pages/pipelines")))
export const RunPage          = PageLoader(lazy(() => import("@/features/run/pages/run")))
export const ContentPage      = PageLoader(lazy(() => import("@/features/content/pages/content")))
export const ContentDetailPage = PageLoader(lazy(() => import("@/features/content/pages/content-detail")))
export const UploadPage       = PageLoader(lazy(() => import("@/features/upload/pages/upload")))
export const PostsPage        = PageLoader(lazy(() => import("@/features/posts/pages/posts-page")))
export const PostDetailPage   = PageLoader(lazy(() => import("@/features/posts/pages/post-detail-page")))
export const SettingsAccountsPage = PageLoader(
  lazy(() => import("@/features/settings/pages/settings-accounts")),
)
export const UsagePage = PageLoader(lazy(() => import("@/features/usage/pages/usage")))
export const LogsPage         = PageLoader(lazy(() => import("@/features/logs/pages/logs")))
export const ComponentsLibPage      = PageLoader(lazy(() => import("@/features/components-lib/pages/components-lib")))
export const WorkflowGeneratePage   = PageLoader(lazy(() => import("@/features/workflow/pages/workflow-generate")))

export const LoginPage = PageLoader(lazy(() => import("@/features/auth/pages/login")))
export const SignupPage = PageLoader(lazy(() => import("@/features/auth/pages/signup")))
export const ForgotPasswordPage = PageLoader(
  lazy(() => import("@/features/auth/pages/forgot-password")),
)
export const VerifyOtpPage = PageLoader(lazy(() => import("@/features/auth/pages/verify-otp")))
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
export const AdminUsagePage = PageLoader(lazy(() => import("@/features/admin/pages/admin-usage")))
export const AdminContentPage = PageLoader(lazy(() => import("@/features/admin/pages/admin-content")))
export const AdminContentDetailPage = PageLoader(
  lazy(() => import("@/features/admin/pages/admin-content-detail")),
)
