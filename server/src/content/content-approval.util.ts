import type {
  ApprovalRecord,
  ApprovalStepDef,
  ContentApprovalState,
} from './schemas/content.schema';

export function allRequiredStepsApproved(
  approval: ContentApprovalState | undefined,
): boolean {
  const steps = approval?.steps ?? [];
  if (steps.length === 0) {
    return true;
  }
  const records = approval?.records ?? [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!step.required) {
      continue;
    }
    const has = records.some((r) => r.stepIndex === i);
    if (!has) {
      return false;
    }
  }
  return true;
}

export function nextPendingStepIndex(
  approval: ContentApprovalState | undefined,
): number | null {
  const steps = approval?.steps ?? [];
  const records = approval?.records ?? [];
  for (let i = 0; i < steps.length; i += 1) {
    if (!records.some((r) => r.stepIndex === i)) {
      return i;
    }
  }
  return null;
}

export function buildApprovalStateFromPolicy(
  steps: ApprovalStepDef[],
): ContentApprovalState {
  return {
    steps,
    currentStepIndex: 0,
    records: [],
  };
}

export function appendApprovalRecord(
  approval: ContentApprovalState,
  record: ApprovalRecord,
): ContentApprovalState {
  const records = [...(approval.records ?? []), record];
  const nextIndex = nextPendingStepIndex({ ...approval, records });
  return {
    ...approval,
    records,
    currentStepIndex: nextIndex ?? (approval.steps?.length ?? 0),
  };
}
