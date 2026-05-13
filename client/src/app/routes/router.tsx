import { createBrowserRouter, Navigate } from "react-router-dom"

import AppLayout from "@/components/core/layouts/app-layout"
import { AdminRoute, GuestOnlyRoute, ProtectedLayout } from "@/features/auth/components/auth-routes"
import {
  HomePage,
  DashboardPage,
  RulesPage,
  WorkflowPage,
  RunPage,
  ContentPage,
  ContentDetailPage,
  UploadPage,
  SettingsAccountsPage,
  AnalyticsPage,
  AnalyticsDetailPage,
  LogsPage,
  ComponentsLibPage,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  VerifyOtpPage,
  ResetPasswordPage,
  AdminDashboardPage,
  AdminUsersPage,
  AdminUserNewPage,
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
    element: <Navigate to="/login?next=/admin" replace />,
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/rules", element: <RulesPage /> },
          { path: "/workflow/:ruleId", element: <WorkflowPage /> },
          { path: "/run", element: <RunPage /> },
          { path: "/content", element: <ContentPage /> },
          { path: "/content/:contentId", element: <ContentDetailPage /> },
          { path: "/contents/:contentId", element: <ContentDetailPage /> },
          { path: "/upload", element: <UploadPage /> },
          { path: "/upload/:uploadId", element: <UploadPage /> },
          { path: "/settings/accounts", element: <SettingsAccountsPage /> },
          { path: "/analytics", element: <AnalyticsPage /> },
          { path: "/analytics/:ruleId", element: <AnalyticsDetailPage /> },
          { path: "/logs", element: <LogsPage /> },
          { path: "/components", element: <ComponentsLibPage /> },

          {
            path: "/admin",
            element: (
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            ),
          },
          {
            path: "/admin/users",
            element: (
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            ),
          },
          {
            path: "/admin/users/new",
            element: (
              <AdminRoute>
                <AdminUserNewPage />
              </AdminRoute>
            ),
          },
        ],
      },
    ],
  },
])
