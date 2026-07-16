import enAdmin from "./locales/en/admin.json"
import enAuth from "./locales/en/auth.json"
import enCommon from "./locales/en/common.json"
import enValidation from "./locales/en/validation.json"
import enContent from "./locales/en/content.json"
import enCredit from "./locales/en/credit.json"
import enUsage from "./locales/en/usage.json"
import enDashboard from "./locales/en/dashboard.json"
import enHome from "./locales/en/home.json"
import enMarketing from "./locales/en/marketing.json"
import enFaq from "./locales/en/faq.json"
import enNotifications from "./locales/en/notifications.json"
import enPipeline from "./locales/en/pipeline.json"
import enPosts from "./locales/en/posts.json"
import enRules from "./locales/en/rules.json"
import enSettings from "./locales/en/settings.json"
import enUpload from "./locales/en/upload.json"
import enWorkflow from "./locales/en/workflow.json"

import thAdmin from "./locales/th/admin.json"
import thAuth from "./locales/th/auth.json"
import thCommon from "./locales/th/common.json"
import thValidation from "./locales/th/validation.json"
import thContent from "./locales/th/content.json"
import thCredit from "./locales/th/credit.json"
import thUsage from "./locales/th/usage.json"
import thDashboard from "./locales/th/dashboard.json"
import thHome from "./locales/th/home.json"
import thMarketing from "./locales/th/marketing.json"
import thFaq from "./locales/th/faq.json"
import thNotifications from "./locales/th/notifications.json"
import thPipeline from "./locales/th/pipeline.json"
import thPosts from "./locales/th/posts.json"
import thRules from "./locales/th/rules.json"
import thSettings from "./locales/th/settings.json"
import thUpload from "./locales/th/upload.json"
import thWorkflow from "./locales/th/workflow.json"

import zhAdmin from "./locales/zh-CN/admin.json"
import zhAuth from "./locales/zh-CN/auth.json"
import zhCommon from "./locales/zh-CN/common.json"
import zhValidation from "./locales/zh-CN/validation.json"
import zhContent from "./locales/zh-CN/content.json"
import zhCredit from "./locales/zh-CN/credit.json"
import zhUsage from "./locales/zh-CN/usage.json"
import zhDashboard from "./locales/zh-CN/dashboard.json"
import zhHome from "./locales/zh-CN/home.json"
import zhMarketing from "./locales/zh-CN/marketing.json"
import zhFaq from "./locales/zh-CN/faq.json"
import zhNotifications from "./locales/zh-CN/notifications.json"
import zhPipeline from "./locales/zh-CN/pipeline.json"
import zhPosts from "./locales/zh-CN/posts.json"
import zhRules from "./locales/zh-CN/rules.json"
import zhSettings from "./locales/zh-CN/settings.json"
import zhUpload from "./locales/zh-CN/upload.json"
import zhWorkflow from "./locales/zh-CN/workflow.json"

export const I18N_NAMESPACES = [
  "common",
  "validation",
  "auth",
  "home",
  "marketing",
  "faq",
  "dashboard",
  "rules",
  "workflow",
  "pipeline",
  "content",
  "upload",
  "posts",
  "credit",
  "usage",
  "notifications",
  "settings",
  "admin",
] as const

export type I18nNamespace = (typeof I18N_NAMESPACES)[number]

export const resources = {
  en: {
    common: enCommon,
    validation: enValidation,
    auth: enAuth,
    home: enHome,
    marketing: enMarketing,
    faq: enFaq,
    dashboard: enDashboard,
    rules: enRules,
    workflow: enWorkflow,
    pipeline: enPipeline,
    content: enContent,
    upload: enUpload,
    posts: enPosts,
    credit: enCredit,
    usage: enUsage,
    notifications: enNotifications,
    settings: enSettings,
    admin: enAdmin,
  },
  th: {
    common: thCommon,
    validation: thValidation,
    auth: thAuth,
    home: thHome,
    marketing: thMarketing,
    faq: thFaq,
    dashboard: thDashboard,
    rules: thRules,
    workflow: thWorkflow,
    pipeline: thPipeline,
    content: thContent,
    upload: thUpload,
    posts: thPosts,
    credit: thCredit,
    usage: thUsage,
    notifications: thNotifications,
    settings: thSettings,
    admin: thAdmin,
  },
  "zh-CN": {
    common: zhCommon,
    validation: zhValidation,
    auth: zhAuth,
    home: zhHome,
    marketing: zhMarketing,
    faq: zhFaq,
    dashboard: zhDashboard,
    rules: zhRules,
    workflow: zhWorkflow,
    pipeline: zhPipeline,
    content: zhContent,
    upload: zhUpload,
    posts: zhPosts,
    credit: zhCredit,
    usage: zhUsage,
    notifications: zhNotifications,
    settings: zhSettings,
    admin: zhAdmin,
  },
} as const
