const WORKFLOW_TOUR_SEEN_KEY = "workflow:tourSeen"

export function hasSeenWorkflowTour(): boolean {
  return localStorage.getItem(WORKFLOW_TOUR_SEEN_KEY) === "1"
}

export function markWorkflowTourSeen() {
  localStorage.setItem(WORKFLOW_TOUR_SEEN_KEY, "1")
}
