import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RuleMemoryType } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { LlmService } from '../llm/llm.service';
import { RULE_MEMORY_REPOSITORY } from '../repositories/tokens';
import type { IRuleMemoryRepository } from '../repositories/interfaces/rule-memory.repository.interface';

const RECENT_LIMIT = 10;

/**
 * Durable operational notes about a brand that don't fit the Rule's own
 * structured fields (brand/audience/campaign/...) or an uploaded document —
 * preferences and corrections the user states mid-conversation ("never
 * suggest infographics for LinkedIn"). Embedded on write so they're also
 * searchable (see RuleMemorySearchService) once the list grows past what
 * gets auto-injected into the system prompt.
 */
@Injectable()
export class RuleMemoryService {
  constructor(
    @Inject(RULE_MEMORY_REPOSITORY)
    private readonly memories: IRuleMemoryRepository,
    private readonly llm: LlmService,
  ) {}

  async remember(
    ruleId: string,
    type: RuleMemoryType,
    body: string,
    auth: TenancyAuth,
    replaceIds: string[] = [],
  ) {
    const trimmed = body.trim();
    // A newer note on the same topic supersedes the old one instead of piling
    // up contradicting notes. Only this brand's notes can be replaced.
    const replaced = await this.removeOwnNotes(ruleId, replaceIds, auth);
    const embedding = await this.llm.embedQuery(trimmed).catch(() => null);
    const created = await this.memories.create({
      ruleId,
      userId: auth.userId,
      type,
      body: trimmed,
      embedding: embedding ?? undefined,
    });
    return { ...created, replacedIds: replaced };
  }

  /** Removes every note for this brand (one change: "forget everything"). */
  async forgetAll(ruleId: string, auth: TenancyAuth): Promise<number> {
    const all = await this.memories.findByRuleId(ruleId, auth);
    let removed = 0;
    for (const memory of all) {
      if (await this.memories.deleteById(memory.ruleMemoryId, auth)) removed += 1;
    }
    return removed;
  }

  private async removeOwnNotes(
    ruleId: string,
    ids: string[],
    auth: TenancyAuth,
  ): Promise<string[]> {
    const removed: string[] = [];
    for (const id of new Set(ids.map((i) => i.trim()).filter(Boolean))) {
      const existing = await this.memories.findById(id, auth);
      if (!existing || existing.ruleId !== ruleId) continue;
      if (await this.memories.deleteById(id, auth)) removed.push(id);
    }
    return removed;
  }

  async forget(ruleMemoryId: string, auth: TenancyAuth): Promise<void> {
    const deleted = await this.memories.deleteById(ruleMemoryId, auth);
    if (!deleted) {
      throw new NotFoundException(`Memory ${ruleMemoryId} not found`);
    }
  }

  /** Most recent memories — what gets folded into the system prompt every turn. */
  listRecent(ruleId: string, auth: TenancyAuth, limit = RECENT_LIMIT) {
    return this.memories.findByRuleId(ruleId, auth, limit);
  }

  /** All notes for the brand (UI / management). Embeddings are omitted. */
  async listForUi(ruleId: string, auth: TenancyAuth, limit = 100) {
    const rows = await this.memories.findByRuleId(ruleId, auth, limit);
    return rows.map((row) => ({
      ruleMemoryId: row.ruleMemoryId,
      ruleId: row.ruleId,
      type: row.type,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
