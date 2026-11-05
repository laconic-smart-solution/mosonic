import { z } from 'zod';
import type { SectionContractDefinition } from '../../pipeline/contracts/instruction-contract.interface';

export interface DynamicZodSchemaOptions {
  strictMode?: boolean; // When true, all keys are required; optional fields use .nullable()
}

/**
 * Builds a typed Zod schema dynamically from section definitions.
 * Specifically configured to adhere to OpenAI Structured Outputs strict mode requirements:
 * - All object keys must be in the required list.
 * - Optional fields are represented as `.nullable()`.
 * - No disallowed schema constructs.
 */
export function buildDynamicZodSchema(
  sections: SectionContractDefinition[],
  options: DynamicZodSchemaOptions = { strictMode: true },
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const s of sections) {
    let fieldSchema: z.ZodTypeAny;

    switch (s.kind) {
      case 'bullet_list':
      case 'numbered_list': {
        const itemSchema = z.string().describe(`Bullet point item for ${s.title}`);
        let arraySchema = z.array(itemSchema).describe(s.guidelines || s.title);
        if (s.minItems && s.minItems > 0) {
          arraySchema = arraySchema.min(s.minItems);
        }
        if (s.maxItems && s.maxItems > 0) {
          arraySchema = arraySchema.max(s.maxItems);
        }
        fieldSchema = arraySchema;
        break;
      }
      case 'hashtags': {
        const tagSchema = z.string().describe('Hashtag including # symbol');
        let arraySchema = z.array(tagSchema).describe(s.guidelines || 'Campaign hashtags');
        if (s.minItems && s.minItems > 0) {
          arraySchema = arraySchema.min(s.minItems);
        }
        fieldSchema = arraySchema;
        break;
      }
      case 'heading':
      case 'paragraph':
      case 'call_to_action':
      case 'quote':
      case 'rich_text':
      default: {
        fieldSchema = z.string().describe(s.guidelines || s.title);
        break;
      }
    }

    if (!s.required) {
      if (options.strictMode) {
        // OpenAI strict mode requires all keys in the schema, but allows null
        shape[s.key] = fieldSchema.nullable().describe(`${s.title} (optional, return null if not applicable)`);
      } else {
        shape[s.key] = fieldSchema.optional();
      }
    } else {
      shape[s.key] = fieldSchema;
    }
  }

  return z.object(shape);
}

