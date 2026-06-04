import {
  allRequiredStepsApproved,
  appendApprovalRecord,
  buildApprovalStateFromPolicy,
  nextPendingStepIndex,
} from './content-approval.util';

describe('content-approval.util', () => {
  it('requires all mandatory steps before final approval', () => {
    const state = buildApprovalStateFromPolicy([
      { role: 'editor', required: true },
      { role: 'legal', required: false },
    ]);
    expect(allRequiredStepsApproved(state)).toBe(false);
    const afterEditor = appendApprovalRecord(state, {
      stepIndex: 0,
      userId: 'u1',
      at: new Date(),
      comment: null,
    });
    expect(allRequiredStepsApproved(afterEditor)).toBe(true);
    expect(nextPendingStepIndex(afterEditor)).toBe(1);
  });
});
