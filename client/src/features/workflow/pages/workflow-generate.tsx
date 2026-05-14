import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkflowNodeList } from "@/features/workflow/components/workflow-node-list"
import { WorkflowAddNodeSelector } from "@/features/workflow/components/workflow-add-node-selector"
import { useGetWorkflowQuery, useSaveWorkflowNodesMutation } from "@/shared/queries/workflow.query"
import {
  joinWorkflowRoom,
  leaveWorkflowRoom,
  onWorkflowCompleted,
  onWorkflowFailed,
  onWorkflowGenerating,
  onWorkflowStarted,
} from "@/shared/socket/workflow-events"
import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"
import { T } from "@/lib/tokens"

type Phase = "loading" | "ready" | "failed"

function generateNodeId() {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export default function WorkflowGeneratePage() {
  const { workflowId } = useParams<{ workflowId: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>("loading")
  const [statusMessage, setStatusMessage] = useState("Preparing your workflow…")
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [addNodeOpen, setAddNodeOpen] = useState(false)
  const [failureMessage, setFailureMessage] = useState("")

  const workflowQuery = useGetWorkflowQuery(workflowId)
  const saveNodesMutation = useSaveWorkflowNodesMutation()

  // Recovery path: if query succeeds with nodes, jump straight to ready
  useEffect(() => {
    if (workflowQuery.data && workflowQuery.data.nodes.length > 0) {
      setNodes(workflowQuery.data.nodes)
      setPhase("ready")
    }
  }, [workflowQuery.data])

  // Socket events
  useEffect(() => {
    if (!workflowId) return

    joinWorkflowRoom(workflowId)

    const cleanups = [
      onWorkflowStarted(({ workflowId: id }) => {
        if (id !== workflowId) return
        setStatusMessage("Preparing your workflow…")
      }),
      onWorkflowGenerating(({ workflowId: id }) => {
        if (id !== workflowId) return
        setStatusMessage("Building your workflow…")
      }),
      onWorkflowCompleted(({ workflowId: id, nodes: receivedNodes }) => {
        if (id !== workflowId) return
        leaveWorkflowRoom(workflowId)
        setNodes(receivedNodes)
        setPhase("ready")
      }),
      onWorkflowFailed(({ workflowId: id, message }) => {
        if (id !== workflowId) return
        leaveWorkflowRoom(workflowId)
        setFailureMessage(message ?? "Could not generate workflow. Please try again.")
        setPhase("failed")
      }),
    ]

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [workflowId])

  const handleAddNode = useCallback((type: WorkflowNodeType) => {
    setNodes((prev) => {
      if (type === "keyword_planner" && prev.some((n) => n.type === "keyword_planner")) {
        return prev
      }
      if (type === "text_generation" && prev.some((n) => n.type === "text_generation")) {
        return prev
      }
      const nextOrder = prev.length + 1
      const newNode: WorkflowNode = {
        nodeId: generateNodeId(),
        type,
        order: nextOrder,
        isLocked: false,
      }
      return [...prev, newNode]
    })
  }, [])

  function handleSave() {
    if (!workflowId) return
    saveNodesMutation.mutate({ workflowId, nodes })
  }

  function handleRetry() {
    navigate(-1)
  }

  if (phase === "loading") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: T.canvasBg }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </div>
    )
  }

  if (phase === "failed") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: T.canvasBg }}
      >
        <p className="text-sm text-destructive">{failureMessage}</p>
        <Button variant="outline" onClick={handleRetry}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Workflow Nodes</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddNodeOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Node
        </Button>
      </div>

      <WorkflowNodeList nodes={nodes} onNodesChange={setNodes} />

      <Button
        type="button"
        onClick={handleSave}
        disabled={saveNodesMutation.isPending}
        className="w-full"
      >
        {saveNodesMutation.isPending ? "Saving…" : "Save Changes"}
      </Button>

      <WorkflowAddNodeSelector
        open={addNodeOpen}
        onOpenChange={setAddNodeOpen}
        onSelect={handleAddNode}
      />
    </div>
  )
}
