import { createBrowserRouter } from "react-router-dom"

import AppLayout from "@/components/core/layouts/app-layout"
import {
  HomePage,
  DashboardPage,
  RulesPage,
  WorkflowPage,
  RunPage,
  ContentPage,
  ContentDetailPage,
  UploadPage,
  AnalyticsPage,
  LogsPage,
  ComponentsLibPage,
  AdminLoginPage,
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
    path: "/admin/login",
    element: <AdminLoginPage />,
  },
  {
    element: <AppLayout />,
    children: [
      { path: "/dashboard",             element: <DashboardPage /> },
      { path: "/rules",                 element: <RulesPage /> },
      { path: "/workflow/:ruleId",      element: <WorkflowPage /> },
      { path: "/run",                   element: <RunPage /> },
      { path: "/content",               element: <ContentPage /> },
      { path: "/content/:contentId",    element: <ContentDetailPage /> },
      { path: "/contents/:contentId",   element: <ContentDetailPage /> },
      { path: "/upload",                element: <UploadPage /> },
      { path: "/upload/:uploadId",      element: <UploadPage /> },
      { path: "/analytics",             element: <AnalyticsPage /> },
      { path: "/logs",                  element: <LogsPage /> },
      { path: "/components",            element: <ComponentsLibPage /> },

      { path: "/admin",                 element: <AdminDashboardPage /> },
      { path: "/admin/users",           element: <AdminUsersPage /> },
      { path: "/admin/users/new",       element: <AdminUserNewPage /> },
    ],
  },
])
