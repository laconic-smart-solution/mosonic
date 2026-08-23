import { createBrowserRouter, Navigate } from "react-router-dom"

import AppLayout from "@/components/core/layouts/app-layout"
import { AdminShell } from "@/features/admin/components/admin-shell"
import { AdminRoute, GuestOnlyRoute, ProtectedLayout } from "@/features/auth/components/auth-routes"
import { MarketingLayout } from "@/features/marketing/components/marketing-layout"
import {
  HomePage,
  LandingPage,
  PricingPage,
  MarketingFaqPage,
  DashboardPage,
  RulesPage,
  NewsTriggerPage,
  WorkflowPage,
  WorkflowsListPage,
  PipelinesPage,
  ContentPage,
  ContentDetailPage,
  UploadPage,
  PostsPage,
  PostDetailPage,
  SettingsAccountsPage,
  UsageBillingLayout,
  UsageOverviewPage,
  UsageTopupPage,
  UsagePlansPage,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  VerifyOtpPage,
  VerifyOriginPage,
  ResetPasswordPage,
  AdminDashboardPage,
  AdminUsersPage,
  AdminUserDetailPage,
  AdminCostPage,
  AdminCreditConfigPage,
  AdminNodeCreditsPage,
  AdminPlansPage,
  AdminTopupPlansPage,
  AdminUsagePage,
  AdminApiUsagePage,
  AdminContentPage,
  AdminContentDetailPage,
  AdminFaqPage,
  AdminFaqDocumentDetailPage,
  AdminLinePage,
  AdminAnnouncementsPage,
  AnnouncementsPage,
  SuspendedPage,
  NotFoundPage,
} from "../constants/lazyload"

export const router = createBrowserRouter([
  {
    element: <MarketingLayout />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/home", element: <HomePage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/faq", element: <MarketingFaqPage /> },
      { path: "/about", element: <Navigate to="/#about" replace /> },
    ],
  },
  {
    path: "/landing",
    element: <Navigate to="/" replace />,
  },
  {
    path: "/login",
    element: (
      <GuestOnlyRoute>
        <LoginPage />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/signup",
    element: (
      <GuestOnlyRoute>
        <SignupPage />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <GuestOnlyRoute>
        <ForgotPasswordPage />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/verify-otp",
    element: (
      <GuestOnlyRoute>
        <VerifyOtpPage />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <GuestOnlyRoute>
        <ResetPasswordPage />
      </GuestOnlyRoute>
    ),
  },
  {
    // Competition Event "Open Mosonic" SSO handoff — handles both
    // authenticated and unauthenticated visitors itself, so it isn't
    // wrapped in GuestOnlyRoute/ProtectedLayout.
    path: "/verify-origin",
    element: <VerifyOriginPage />,
  },
  {
    path: "/admin/login",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/suspended",
    element: <SuspendedPage />,
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/rules", element: <RulesPage /> },
          { path: "/rules/:ruleId/news-trigger", element: <NewsTriggerPage /> },
          { path: "/workflows", element: <WorkflowsListPage /> },
          { path: "/pipelines", element: <PipelinesPage /> },
          { path: "/workflow/:ruleId", element: <WorkflowPage /> },
          { path: "/content", element: <ContentPage /> },
          { path: "/content/:contentId", element: <ContentDetailPage /> },
          { path: "/contents/:contentId", element: <ContentDetailPage /> },
          { path: "/upload", element: <UploadPage /> },
          { path: "/upload/:uploadId", element: <UploadPage /> },
          { path: "/posts", element: <PostsPage /> },
          { path: "/posts/:postId", element: <PostDetailPage /> },
          { path: "/announcements", element: <AnnouncementsPage /> },
          { path: "/settings/accounts", element: <SettingsAccountsPage /> },
          {
            path: "/usage",
            element: <UsageBillingLayout />,
            children: [
              { index: true, element: <UsageOverviewPage /> },
              { path: "topup", element: <UsageTopupPage /> },
              { path: "plans", element: <UsagePlansPage /> },
            ],
          },
          { path: "/cost", element: <Navigate to="/usage" replace /> },
          { path: "/cost/budget", element: <Navigate to="/usage" replace /> },
        ],
      },
      {
        path: "/admin",
        element: (
          <AdminRoute>
            <AdminShell />
          </AdminRoute>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: "dashboard", element: <AdminDashboardPage /> },
          { path: "users", element: <AdminUsersPage /> },
          { path: "users/:userId", element: <AdminUserDetailPage /> },
          { path: "credit", element: <AdminCreditConfigPage /> },
          { path: "node-credits", element: <AdminNodeCreditsPage /> },
          { path: "plans", element: <AdminPlansPage /> },
          { path: "topup-plans", element: <AdminTopupPlansPage /> },
          { path: "usage", element: <AdminUsagePage /> },
          { path: "cost", element: <AdminCostPage /> },
          { path: "api-usage", element: <AdminApiUsagePage /> },
          { path: "content", element: <AdminContentPage /> },
          { path: "content/:contentId", element: <AdminContentDetailPage /> },
          { path: "faq", element: <AdminFaqPage /> },
          { path: "faq/documents/:documentId", element: <AdminFaqDocumentDetailPage /> },
          { path: "communication/line", element: <AdminLinePage /> },
          {
            path: "communication/announcements",
            element: <AdminAnnouncementsPage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
])
