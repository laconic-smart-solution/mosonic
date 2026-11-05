/**
 * Live state as typed facts. buildLiveState reads these fresh every turn;
 * renderLiveState turns them into the "## Live state" prompt block (the text
 * is unchanged from when it was built inline), and code reads the fields
 * instead of regex-scraping the prompt.
 */
export type LiveFacts = {
  /** null = this brand has no workflow yet. */
  workflow: { status: string; steps: string } | null;
  /** Only read when a workflow exists. */
  activeRun: { pipelineId: string; status: string } | null;
  latestPost: { contentId: string; status: string; hasImage: boolean } | null;
  upload: {
    uploadId: string;
    status: string;
    channels: { channel: string; status: string; included: boolean }[];
  } | null;
  /** null = the account lookup failed (the line is left out). */
  accounts: { channel: string; label: string; connected: boolean }[] | null;
  memoryCount: number;
};

export const LIVE_STATE_HEADER =
  '## Live state (read fresh this turn - this is the truth; it overrides memory notes and earlier chat messages)';

export function renderLiveState(facts: LiveFacts): string {
  const lines = [LIVE_STATE_HEADER];
  if (!facts.workflow) {
    lines.push('Workflow: none yet.');
  } else {
    lines.push(
      `Workflow (${facts.workflow.status}), steps in execution order:`,
      facts.workflow.steps,
      facts.activeRun
        ? `Active run: ${facts.activeRun.pipelineId} (${facts.activeRun.status}).`
        : 'Active run: none.',
    );
    if (facts.latestPost) {
      lines.push(`Latest post ("that post" / "current post" / "it" means this one): ${latestDraftText(facts)}.`);
      if (facts.upload) {
        const ch = facts.upload.channels
          .map((c) => `${c.channel}:${c.status}${c.included ? '' : '(off)'}`)
          .join(', ');
        lines.push(`Upload ${facts.upload.uploadId} (${facts.upload.status}): ${ch || 'no channels'}.`);
      }
    }
  }
  if (facts.accounts) {
    lines.push(
      facts.accounts.length
        ? `Connected accounts: ${facts.accounts.map((a) => a.label).join(', ')}.`
        : 'Connected accounts: none.',
    );
  }
  lines.push(`Saved memory notes: ${facts.memoryCount}.`);
  return lines.join('\n');
}

/** "content <id>, status <s>, image: yes|no" for the Latest post, or null. */
export function latestDraftText(facts: LiveFacts | null | undefined): string | null {
  const p = facts?.latestPost;
  if (!p) return null;
  return `content ${p.contentId}, status ${p.status}, image: ${p.hasImage ? 'yes' : 'no'}`;
}

/** Lower-cased channels that are connected right now (needs_reauth does not count). */
export function connectedChannels(facts: LiveFacts | null | undefined): Set<string> {
  return new Set((facts?.accounts ?? []).filter((a) => a.connected).map((a) => a.channel.trim().toLowerCase()));
}

const PUBLISHED = /^(published|posted|success|succeeded|live)$/i;

/** True when any channel of the Latest post's upload is published. */
export function latestPostPublished(facts: LiveFacts | null | undefined): boolean {
  return !!facts?.upload?.channels.some((c) => c.included && PUBLISHED.test(c.status));
}
