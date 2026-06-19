import enAdmin from "./locales/en/admin.json"
import enAuth from "./locales/en/auth.json"
import enCommon from "./locales/en/common.json"
import enComponentsLib from "./locales/en/componentsLib.json"
import enContent from "./locales/en/content.json"
import enCost from "./locales/en/cost.json"
import enCredit from "./locales/en/credit.json"
import enUsage from "./locales/en/usage.json"
import enDashboard from "./locales/en/dashboard.json"
import enHome from "./locales/en/home.json"
import enLogs from "./locales/en/logs.json"
import enNotifications from "./locales/en/notifications.json"
import enPipeline from "./locales/en/pipeline.json"
import enPosts from "./locales/en/posts.json"
import enRules from "./locales/en/rules.json"
import enRun from "./locales/en/run.json"
import enSettings from "./locales/en/settings.json"
import enUpload from "./locales/en/upload.json"
import enWorkflow from "./locales/en/workflow.json"

import thAdmin from "./locales/th/admin.json"
import thAuth from "./locales/th/auth.json"
import thCommon from "./locales/th/common.json"
import thComponentsLib from "./locales/th/componentsLib.json"
import thContent from "./locales/th/content.json"
import thCost from "./locales/th/cost.json"
import thCredit from "./locales/th/credit.json"
import thUsage from "./locales/th/usage.json"
import thDashboard from "./locales/th/dashboard.json"
import thHome from "./locales/th/home.json"
import thLogs from "./locales/th/logs.json"
import thNotifications from "./locales/th/notifications.json"
import thPipeline from "./locales/th/pipeline.json"
import thPosts from "./locales/th/posts.json"
import thRules from "./locales/th/rules.json"
import thRun from "./locales/th/run.json"
import thSettings from "./locales/th/settings.json"
import thUpload from "./locales/th/upload.json"
import thWorkflow from "./locales/th/workflow.json"

import zhAdmin from "./locales/zh-CN/admin.json"
import zhAuth from "./locales/zh-CN/auth.json"
import zhCommon from "./locales/zh-CN/common.json"
import zhComponentsLib from "./locales/zh-CN/componentsLib.json"
import zhContent from "./locales/zh-CN/content.json"
import zhCost from "./locales/zh-CN/cost.json"
import zhCredit from "./locales/zh-CN/credit.json"
import zhUsage from "./locales/zh-CN/usage.json"
import zhDashboard from "./locales/zh-CN/dashboard.json"
import zhHome from "./locales/zh-CN/home.json"
import zhLogs from "./locales/zh-CN/logs.json"
import zhNotifications from "./locales/zh-CN/notifications.json"
import zhPipeline from "./locales/zh-CN/pipeline.json"
import zhPosts from "./locales/zh-CN/posts.json"
import zhRules from "./locales/zh-CN/rules.json"
import zhRun from "./locales/zh-CN/run.json"
import zhSettings from "./locales/zh-CN/settings.json"
import zhUpload from "./locales/zh-CN/upload.json"
import zhWorkflow from "./locales/zh-CN/workflow.json"

export const I18N_NAMESPACES = [
  "common",
  "auth",
  "home",
  "dashboard",
  "rules",
  "workflow",
  "pipeline",
  "run",
  "content",
  "upload",
  "posts",
  "cost",
  "credit",
  "usage",
  "logs",
  "notifications",
  "settings",
  "admin",
  "componentsLib",
] as const

export type I18nNamespace = (typeof I18N_NAMESPACES)[number]

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    home: enHome,
    dashboard: enDashboard,
    rules: enRules,
    workflow: enWorkflow,
    pipeline: enPipeline,
    run: enRun,
    content: enContent,
    upload: enUpload,
    posts: enPosts,
    cost: enCost,
    credit: enCredit,
    usage: enUsage,
    logs: enLogs,
    notifications: enNotifications,
    settings: enSettings,
    admin: enAdmin,
    componentsLib: enComponentsLib,
  },
  th: {
    common: thCommon,
    auth: thAuth,
    home: thHome,
    dashboard: thDashboard,
    rules: thRules,
    workflow: thWorkflow,
    pipeline: thPipeline,
    run: thRun,
    content: thContent,
    upload: thUpload,
    posts: thPosts,
    cost: thCost,
    credit: thCredit,
    usage: thUsage,
    logs: thLogs,
    notifications: thNotifications,
    settings: thSettings,
    admin: thAdmin,
    componentsLib: thComponentsLib,
  },
  "zh-CN": {
    common: zhCommon,
    auth: zhAuth,
    home: zhHome,
    dashboard: zhDashboard,
    rules: zhRules,
    workflow: zhWorkflow,
    pipeline: zhPipeline,
    run: zhRun,
    content: zhContent,
    upload: zhUpload,
    posts: zhPosts,
    cost: zhCost,
    credit: zhCredit,
    usage: zhUsage,
    logs: zhLogs,
    notifications: zhNotifications,
    settings: zhSettings,
    admin: zhAdmin,
    componentsLib: zhComponentsLib,
  },
} as const
