import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NodeImageTemplate } from '../../nodes/schemas/workflow-node.schema';

/** "auto" is a sentinel for AI classification, not a selectable row. */
const CREATABLE_TEMPLATE_KEYS = Object.values(NodeImageTemplate).filter(
  (v) => v !== NodeImageTemplate.Auto,
);

/** Multipart form fields arrive as strings ("true"/"false"), not booleans. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class AdminCreateImageTemplateDto {
  @IsEnum(CREATABLE_TEMPLATE_KEYS, {
    message: `key must be one of: ${CREATABLE_TEMPLATE_KEYS.join(', ')}`,
  })
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean = true;
}

export class AdminUpdateImageTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @Transform(toBoolean)
  @IsBoolean()
  isActive!: boolean;
}
