import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { McpService } from '../../mcp/mcp.service';
import type { PlanChannelAccessService } from '../../plan/plan-channel-access.service';
import type { RedNoteService } from '../../rednote/rednote.service';
import type { RuleService } from '../rule.service';
import {
  DISTRIBUTION_CHANNELS,
  normalizeChannelId,
} from '../../workflow/distribution-channels.util';
import { runTool, toolError, toolOk } from './tool-error.util';

const PLATFORM_SCHEMA = z
  .string()
  .min(1)
  .describe(
    'Channel id: instagram, facebook, linkedin, youtube, tiktok, or rednote.',
  );

/** OAuth / RedNote QR chips need the user to finish before more tools run. */
export function isOAuthStartObservation(result: string): boolean {
  try {
    const parsed: unknown = JSON.parse(result);
    if (!parsed || typeof parsed !== 'object') return false;
    const action = (parsed as { action?: unknown; ok?: unknown }).action;
    const ok = (parsed as { ok?: unknown }).ok;
    return (
      ok === true &&
      (action === 'start_oauth' || action === 'start_rednote_qr')
    );
  } catch {
    return false;
  }
}

async function channelAuthRows(
  userId: string,
  brandChannels: string[],
  mcp: McpService,
  planAccess: PlanChannelAccessService,
  rednote: RedNoteService,
): Promise<
  Array<{
    channel: string;
    inBrand: boolean;
    auth: 'connected' | 'missing' | 'plan_blocked' | 'needs_reauth';
    username: string | null;
  }>
> {
  const connected = await mcp.getConnectedAccounts(userId);
  const byChannel = new Map(
    connected.accounts.map((a) => [
      normalizeChannelId(a.channel),
      a.username?.trim() || null,
    ]),
  );
  const rednoteStatus = await rednote.getAccountStatus(userId);
  const brandSet = new Set(brandChannels.map(normalizeChannelId));
  const toCheck = [
    ...new Set([
      ...DISTRIBUTION_CHANNELS.map((c) => c.id),
      ...brandChannels.map(normalizeChannelId),
    ]),
  ].filter(Boolean);

  const rows: Array<{
    channel: string;
    inBrand: boolean;
    auth: 'connected' | 'missing' | 'plan_blocked' | 'needs_reauth';
    username: string | null;
  }> = [];

  for (const channel of toCheck) {
    const allowed = await planAccess.isChannelAllowed(userId, channel);
    if (!allowed) {
      rows.push({
        channel,
        inBrand: brandSet.has(channel),
        auth: 'plan_blocked',
        username: null,
      });
      continue;
    }
    if (channel === 'rednote') {
      rows.push({
        channel,
        inBrand: brandSet.has(channel),
        auth: rednoteStatus.needsReauth
          ? 'needs_reauth'
          : rednoteStatus.connected
            ? 'connected'
            : 'missing',
        username: rednoteStatus.handle,
      });
      continue;
    }
    if (byChannel.has(channel)) {
      rows.push({
        channel,
        inBrand: brandSet.has(channel),
        auth: 'connected',
        username: byChannel.get(channel) ?? null,
      });
    } else {
      rows.push({
        channel,
        inBrand: brandSet.has(channel),
        auth: 'missing',
        username: null,
      });
    }
  }
  return rows;
}

function brandChannelIds(rule: {
  channels?: Array<{ channel?: string } | string> | null;
}): string[] {
  const raw = rule.channels ?? [];
  return raw
    .map((c) =>
      typeof c === 'string'
        ? normalizeChannelId(c)
        : normalizeChannelId(String(c.channel ?? '')),
    )
    .filter(Boolean);
}

export function createListChannelsTool(
  ruleId: string,
  ruleService: RuleService,
  mcp: McpService,
  planAccess: PlanChannelAccessService,
  rednote: RedNoteService,
  auth: TenancyAuth,
) {
  return tool(
    async () =>
      runTool(async () => {
        const rule = await ruleService.getRuleById(ruleId, auth);
        const brand = brandChannelIds(
          rule as { channels?: Array<{ channel?: string } | string> | null },
        );
        const rows = await channelAuthRows(
          auth.userId,
          brand,
          mcp,
          planAccess,
          rednote,
        );
        return toolOk({
          action: 'list_channels',
          brandChannels: brand,
          supported: DISTRIBUTION_CHANNELS.map((c) => c.id),
          channels: rows.filter((r) => r.inBrand || r.auth !== 'plan_blocked'),
        });
      }),
    {
      name: 'list_channels',
      description:
        'List this brand’s channels vs connected social accounts and plan access. Use before publish when unsure what is connected.',
      schema: z.object({}),
    },
  );
}

export function createCheckChannelAuthTool(
  ruleId: string,
  ruleService: RuleService,
  mcp: McpService,
  planAccess: PlanChannelAccessService,
  rednote: RedNoteService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ channel }) =>
      runTool(async () => {
        const id = normalizeChannelId(channel);
        if (!DISTRIBUTION_CHANNELS.some((c) => c.id === id)) {
          return toolError(
            'unsupported_channel',
            `"${channel}" is not a supported publishing channel.`,
          );
        }
        const rule = await ruleService.getRuleById(ruleId, auth);
        const brand = brandChannelIds(
          rule as { channels?: Array<{ channel?: string } | string> | null },
        );
        const rows = await channelAuthRows(
          auth.userId,
          brand,
          mcp,
          planAccess,
          rednote,
        );
        const row = rows.find((r) => r.channel === id);
        return toolOk({
          action: 'check_channel_auth',
          channel: id,
          inBrand: brand.includes(id),
          auth: row?.auth ?? 'missing',
          username: row?.username ?? null,
        });
      }),
    {
      name: 'check_channel_auth',
      description:
        'Check whether one social channel is connected for this user (and on the plan). Call before publish or start_channel_oauth.',
      schema: z.object({ channel: PLATFORM_SCHEMA }),
    },
  );
}

export function createStartChannelOauthTool(
  mcp: McpService,
  rednote: RedNoteService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ channel }) =>
      runTool(async () => {
        const id = normalizeChannelId(channel);
        if (!DISTRIBUTION_CHANNELS.some((c) => c.id === id)) {
          return toolError(
            'unsupported_channel',
            `"${channel}" is not a supported publishing channel.`,
          );
        }
        if (id === 'rednote') {
          const { socketRoom } = await rednote.startConnect(auth.userId);
          return toolOk({
            action: 'start_rednote_qr',
            platform: 'rednote',
            socketRoom,
            message:
              'A Connect RedNote button is shown. Wait for the user to scan the QR; then check_channel_auth.',
          });
        }
        const { connectUrl } = await mcp.connectChannel(id, auth.userId, {
          returnTo: '/home',
        });
        return toolOk({
          action: 'start_oauth',
          platform: id,
          connectUrl,
          message:
            'A Connect button is shown. Wait for the user to finish OAuth and return to chat; then check_channel_auth.',
        });
      }),
    {
      name: 'start_channel_oauth',
      description:
        'Start connecting a social account from chat. Zernio channels return a Connect URL chip (returns to Home). RedNote returns a QR connect chip. Stop and wait after this tool.',
      schema: z.object({ channel: PLATFORM_SCHEMA }),
    },
  );
}
