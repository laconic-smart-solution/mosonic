import { Injectable, Logger } from '@nestjs/common';
import type { InstructionContract } from '../../pipeline/contracts/instruction-contract.interface';
import type { ContentSectionItem } from '../../content/schemas/structured-content.schema';

export interface ValidationIssue {
  sectionKey: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  missingRequiredSections: string[];
}

@Injectable()
export class OutputValidationService {
  private readonly logger = new Logger(OutputValidationService.name);

  /**
   * Deterministically validates generated sections against the InstructionContract.
   */
  validateSections(
    sections: ContentSectionItem[],
    contract: InstructionContract,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const missingRequiredSections: string[] = [];

    if (!contract || !contract.isStructured || !contract.sections?.length) {
      return { valid: true, issues: [], missingRequiredSections: [] };
    }

    const sectionMap = new Map<string, ContentSectionItem>();
    for (const sec of sections) {
      if (sec && sec.key) {
        sectionMap.set(sec.key, sec);
      }
    }

    for (const def of contract.sections) {
      const existing = sectionMap.get(def.key);

      // 1. Required section presence check
      if (def.required) {
        if (!existing) {
          missingRequiredSections.push(def.key);
          issues.push({
            sectionKey: def.key,
            field: 'presence',
            message: `Required section "${def.title}" (${def.key}) is missing.`,
          });
          continue;
        }

        // 2. Non-empty check
        const hasContent = Boolean(existing.content?.trim());
        const hasItems = Array.isArray(existing.items) && existing.items.length > 0;
        if (!hasContent && !hasItems) {
          issues.push({
            sectionKey: def.key,
            field: 'content',
            message: `Required section "${def.title}" (${def.key}) cannot be empty.`,
          });
        }
      }

      if (existing) {
        // 3. Bullet count bounds check
        if (def.kind === 'bullet_list' || def.kind === 'numbered_list') {
          const items = Array.isArray(existing.items) ? existing.items : [];
          if (def.minItems && items.length < def.minItems) {
            issues.push({
              sectionKey: def.key,
              field: 'minItems',
              message: `Section "${def.title}" has ${items.length} items, but requires at least ${def.minItems}.`,
            });
          }
          if (def.maxItems && items.length > def.maxItems) {
            issues.push({
              sectionKey: def.key,
              field: 'maxItems',
              message: `Section "${def.title}" has ${items.length} items, exceeding maximum of ${def.maxItems}.`,
            });
          }
        }

        // 4. Hashtag bounds check
        if (def.kind === 'hashtags') {
          const tags = Array.isArray(existing.items)
            ? existing.items
            : (existing.content ? existing.content.match(/#\w+/g) || [] : []);
          if (def.minItems && tags.length < def.minItems) {
            issues.push({
              sectionKey: def.key,
              field: 'minItems',
              message: `Hashtags section has ${tags.length} tags, but requires at least ${def.minItems}.`,
            });
          }
        }
      }
    }

    const valid = issues.length === 0;
    if (!valid) {
      this.logger.warn(`Section validation failed with ${issues.length} issues: ${issues.map((i) => i.message).join('; ')}`);
    }

    return {
      valid,
      issues,
      missingRequiredSections,
    };
  }

  /**
   * Generates a targeted repair prompt for single-turn AI self-healing.
   */
  buildRepairPrompt(validationResult: ValidationResult, contract: InstructionContract): string {
    const errorList = validationResult.issues.map((i) => `- ${i.message}`).join('\n');
    return [
      'Your previous generated content was incomplete and failed schema validation.',
      'Validation issues detected:',
      errorList,
      '',
      'Please regenerate the complete JSON response, ensuring that all missing sections are filled out and item bounds are strictly respected.',
    ].join('\n');
  }
}

