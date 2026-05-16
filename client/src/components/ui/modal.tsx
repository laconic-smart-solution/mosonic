"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type ModalContextValue = {
  onOpenChange?: (open: boolean) => void
}

const ModalContext = React.createContext<ModalContextValue | null>(null)

function useModalContext() {
  const ctx = React.useContext(ModalContext)
  if (!ctx) {
    throw new Error("Modal components must be used within <Modal>")
  }
  return ctx
}

type ModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Modal({ open = false, onOpenChange, children }: ModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)

  React.useLayoutEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  const handleCancel = React.useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault()
      onOpenChange?.(false)
    },
    [onOpenChange],
  )

  const handleClose = React.useCallback(() => {
    onOpenChange?.(false)
  }, [onOpenChange])

  if (!open) return null

  return (
    <ModalContext.Provider value={{ onOpenChange }}>
      <dialog
        ref={dialogRef}
        data-slot="modal"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 m-0 max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
          "rounded-4xl border-0 bg-transparent p-0 text-popover-foreground shadow-none outline-none",
          "backdrop:bg-black/80 backdrop:backdrop-blur-xs",
          "open:animate-in open:fade-in-0 open:zoom-in-95",
        )}
        onCancel={handleCancel}
        onClose={handleClose}
      >
        {children}
      </dialog>
    </ModalContext.Provider>
  )
}

function ModalContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const { onOpenChange } = useModalContext()

  return (
    <div
      data-slot="modal-content"
      className={cn(
        "relative grid w-full gap-6 rounded-4xl bg-popover p-6 text-sm ring-1 ring-foreground/5 sm:max-w-md",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-4"
          onClick={() => onOpenChange?.(false)}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      ) : null}
    </div>
  )
}

function ModalHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

function ModalTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="modal-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  )
}

function ModalDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="modal-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ModalClose({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { onOpenChange } = useModalContext()
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={() => onOpenChange?.(false)}
      {...props}
    />
  )
}

export {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  ModalClose,
}
