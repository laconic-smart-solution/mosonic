import PageLoader from "@/components/core/page-loader"
import { lazy } from "react"

export const HomePage         = PageLoader(lazy(() => import("@/features/home/pages/home")))
export const DashboardPage    = PageLoader(lazy(() => import("@/features/dashboard/pages/dashboard")))
export const RulesPage        = PageLoader(lazy(() => import("@/features/rules/pages/rules")))
export const WorkflowPromptPage = PageLoader(lazy(() => import("@/features/workflow/pages/workflow-prompt")))
export const WorkflowPage       = PageLoader(lazy(() => import("@/features/workflow/pages/workflow")))
export const RunPage          = PageLoader(lazy(() => import("@/features/run/pages/run")))
export const ContentPage      = PageLoader(lazy(() => import("@/features/content/pages/content")))
export const ContentDetailPage = PageLoader(lazy(() => import("@/features/content/pages/content-detail")))
export const UploadPage       = PageLoader(lazy(() => import("@/features/upload/pages/upload")))
export const AnalyticsPage    = PageLoader(lazy(() => import("@/features/analytics/pages/analytics")))
export const LogsPage         = PageLoader(lazy(() => import("@/features/logs/pages/logs")))
export const ComponentsLibPage      = PageLoader(lazy(() => import("@/features/components-lib/pages/components-lib")))
export const WorkflowGeneratePage   = PageLoader(lazy(() => import("@/features/workflow/pages/workflow-generate")))
