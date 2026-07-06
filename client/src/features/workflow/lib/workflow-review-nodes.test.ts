import { describe, expect, it } from "vitest"

import { listReviewableWorkflowNodes } from "./workflow-review-nodes"
import type { WorkflowNode } from "@/shared/types/workflow.type"

describe("workflow-review-nodes", () => {
  it("lists reviewable nodes sorted by order and excludes structural nodes", () => {
    const nodes: WorkflowNode[] = [
      {
        nodeId: "merge-1",
        type: "merge",
        order: 4,
        isLocked: false,
      },
      {
        nodeId: "img-1",
        type: "image_generation",
        order: 2,
        isLocked: false,
      },
      {
        nodeId: "branch-1",
        type: "branch",
        order: 1,
        isLocked: false,
      },
      {
        nodeId: "text-1",
        type: "text_generation",
        order: 0,
        isLocked: false,
      },
    ]

    expect(listReviewableWorkflowNodes(nodes).map((node) => node.nodeId)).toEqual([
      "text-1",
      "img-1",
    ])
  })
})
