import { formatDistanceToNow } from "date-fns"
import { Bell } from "lucide-react"
import { useCallback, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  browserNotificationPermission,
  browserNotificationStatusLabel,
  canRequestBrowserNotificationPermission,
  canShowBrowserNotificationNow,
  getBrowserNotificationCapability,
  requestBrowserNotificationPermission,
} from "@/features/notifications/browser-notification"
import { useNotificationStore } from "@/features/notifications/notification.store"
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const navigate = useNavigate()
  const items = useNotificationStore((s) => s.items)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const markRead = useNotificationStore((s) => s.markRead)
  const clearAll = useNotificationStore((s) => s.clearAll)

  const [, setPermVersion] = useState(0)
  const capability = getBrowserNotificationCapability()
  const permission = browserNotificationPermission()
  const canRequest = canRequestBrowserNotificationPermission()
  const alertsOn = canShowBrowserNotificationNow()
  const statusHint = browserNotificationStatusLabel()

  const enableAlerts = useCallback(async () => {
    const result = await requestBrowserNotificationPermission()
    setPermVersion((v) => v + 1)
    if (result === "granted") {
      toast.success(
        capability === "ios_pwa"
          ? "Home Screen alerts enabled"
          : "Browser alerts enabled",
      )
    } else if (result === "denied") {
      toast.message("Alerts not enabled", {
        description:
          "You can still use the notification bell and in-app toasts while using NeuralTex.",
      })
    }
  }, [capability])

  function openItem(id: string, href?: string) {
    markRead(id)
    if (href) {
      navigate(href.startsWith("/") ? href : `/${href}`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent hover:bg-muted"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-[#00A589] text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-0">
        <DropdownMenuGroup className="p-1">
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>Notifications</span>
            {items.length > 0 ? (
              <button
                type="button"
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  markAllRead()
                }}
              >
                Mark all read
              </button>
            ) : null}
          </DropdownMenuLabel>

          <p className="px-3 pb-2 text-[10px] leading-snug text-muted-foreground">
            {statusHint}
          </p>

          {canRequest && permission === "default" ? (
            <DropdownMenuItem
              className="text-xs font-medium text-[#00A589]"
              onClick={(e) => {
                e.preventDefault()
                void enableAlerts()
              }}
            >
              Enable background alerts
            </DropdownMenuItem>
          ) : null}

          {canRequest && permission === "denied" ? (
            <DropdownMenuItem
              className="text-xs text-muted-foreground"
              onClick={(e) => {
                e.preventDefault()
                void enableAlerts()
              }}
            >
              Try again (browser settings)
            </DropdownMenuItem>
          ) : null}

          {alertsOn ? (
            <p className="px-3 pb-1 text-[10px] font-medium text-[#00A589]">
              Background alerts on
            </p>
          ) : null}
        </DropdownMenuGroup>

        {(canRequest || capability === "ios_browser") && items.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}

        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No notifications yet
          </p>
        ) : (
          <DropdownMenuGroup className="max-h-[min(360px,50vh)] overflow-y-auto p-1">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-0.5 py-2.5",
                  !item.read && "bg-muted/40",
                )}
                onClick={() => openItem(item.id, item.action?.href)}
              >
                <span className="flex w-full items-center gap-2 text-xs font-semibold">
                  {item.title}
                  {item.sector === "news" ? (
                    <span className="rounded bg-sky-100 px-1 py-0.5 text-[9px] font-medium uppercase text-sky-800">
                      News
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-[10px] text-muted-foreground">
                  {item.message}
                </span>
                <span className="text-[10px] text-muted-foreground/80">
                  {formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}

        {items.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup className="p-1">
              <DropdownMenuItem
                className="justify-center text-xs text-muted-foreground"
                onClick={(e) => {
                  e.preventDefault()
                  clearAll()
                }}
              >
                Clear all
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
