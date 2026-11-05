/** Shared popup class: white body, 16px radius, no inner padding (header/body/footer pad themselves). */
export const CHAT_DIALOG_CONTENT_CLASS =
  "gap-0 overflow-hidden rounded-2xl bg-white dark:bg-navy-700 p-0 text-navy-700 dark:text-[#E8EDF6] ring-canvas-300 dark:ring-white/6 dark:shadow-[0_24px_48px_rgba(0,0,0,0.5)]"

export const chatDialogButton = {
  /** Navy primary (saves). */
  primary: "rounded-[9px] bg-navy-700 dark:bg-teal-400 text-white dark:text-navy-700 hover:bg-navy-600 dark:hover:bg-teal-300",
  /** Teal positive (approve / start). */
  positive: "rounded-[9px] bg-teal-400 text-navy-700 dark:text-[#E8EDF6] hover:bg-teal-300",
  /** Red destructive (delete / reject). */
  destructive: "rounded-[9px] bg-[#D64545] text-white hover:bg-[#D64545]/90",
  secondary: "rounded-[9px] border-canvas-300 dark:border-white/14 bg-white dark:bg-navy-700 text-navy-700 dark:text-[#E8EDF6] hover:bg-canvas-100 dark:hover:bg-white/8",
} as const
