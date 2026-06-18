import { createBrowserRouter, Navigate } from "react-router-dom"

import AppLayout from "@/components/core/layouts/app-layout"
import { AdminShell } from "@/features/admin/components/admin-shell"
import { AdminRoute, GuestOnlyRoute, ProtectedLayout } from "@/features/auth/components/auth-routes"
import {
  HomePage,
  DashboardPage,
  RulesPage,
  NewsTriggerPage,
  WorkflowPage,
  WorkflowsListPage,
  PipelinesPage,
  RunPage,
  ContentPage,
  ContentDetailPage,
  UploadPage,
  PostsPage,
  SettingsAccountsPage,
  AnalyticsPage,
  AnalyticsDetailPage,
  UsagePage,
  LogsPage,
  ComponentsLibPage,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  VerifyOtpPage,
  ResetPasswordPage,
  AdminDashboardPage,
  AdminUsersPage,
  AdminUserDetailPage,
  AdminCostPage,
  AdminCreditConfigPage,
  AdminPlansPage,
  AdminUsagePage,
  AdminContentPage,
  AdminContentDetailPage,
} from "../constants/lazyload"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
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
    path: "/admin/login",
    element: <Navigate to="/login?next=/admin/dashboard" replace />,
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
          { path: "/run", element: <RunPage /> },
          { path: "/content", element: <ContentPage /> },
          { path: "/content/:contentId", element: <ContentDetailPage /> },
          { path: "/contents/:contentId", element: <ContentDetailPage /> },
          { path: "/upload", element: <UploadPage /> },
          { path: "/upload/:uploadId", element: <UploadPage /> },
          { path: "/posts", element: <PostsPage /> },
          { path: "/settings/accounts", element: <SettingsAccountsPage /> },
          { path: "/analytics", element: <AnalyticsPage /> },
          { path: "/analytics/:ruleId", element: <AnalyticsDetailPage /> },
          { path: "/usage", element: <UsagePage /> },
          { path: "/cost", element: <Navigate to="/usage" replace /> },
          { path: "/cost/budget", element: <Navigate to="/usage" replace /> },
          { path: "/logs", element: <LogsPage /> },
          { path: "/components", element: <ComponentsLibPage /> },
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
          { path: "plans", element: <AdminPlansPage /> },
          { path: "usage", element: <AdminUsagePage /> },
          { path: "cost", element: <AdminCostPage /> },
          { path: "content", element: <AdminContentPage /> },
          { path: "content/:contentId", element: <AdminContentDetailPage /> },
        ],
      },
    ],
  },
])
