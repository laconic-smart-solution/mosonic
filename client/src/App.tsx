import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createAppQueryClient } from "@/shared/lib/query-client"
import { useParentFrameSync } from "@/shared/hooks/use-parent-frame-sync"

import { router } from "./app/routes/router"

const queryClient = createAppQueryClient()

export function App() {
  useParentFrameSync()

  return (
    <TooltipProvider delay={200}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </TooltipProvider>
  )
}

export default App
