import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GenerateCompetitionEventContentDto {
  @IsString()
  @IsNotEmpty()
  externalRef!: string;

  @IsString()
  @IsNotEmpty()
  userPrompt!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

/** Runs the workflow attached to `ruleId` with the event detail as content prompt. */
export class GenerateCompetitionEventSocialContentDto {
  @IsString()
  @IsNotEmpty()
  ruleId!: string;

  @IsString()
  @IsNotEmpty()
  externalRef!: string;

  @IsString()
  @IsNotEmpty()
  prompt!: string;

  /** Competition-event cover image; replaces whatever image the workflow produces. */
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class SaveCompetitionEventContentDto {
  @IsInt()
  @Min(1)
  externalRevision!: number;

  @IsString()
  @IsNotEmpty()
  bundleJson!: string;
}

export class ProvisionCompetitionEventUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  authServerUserId?: string;
}

export class ProvisionCompetitionEventUserResponseDto {
  userId!: string;
  email!: string | null;
  username!: string | null;
  name!: string | null;
}

export class GenerateCompetitionEventContentResponseDto {
  contentId!: string;
  pipelineId!: string;
  workflowId!: string;
  bootstrapRuleId!: string;
  externalRef!: string;
  bundleJson!: string;
  reusedExisting!: boolean;
}

export class SaveCompetitionEventContentResponseDto {
  success!: boolean;
  contentId!: string;
  externalRef!: string;
}

export class CompetitionEventSocialContentResponseDto {
  pipelineId!: string;
  workflowId!: string;
  ruleId!: string;
  /** Prisma `PipelineStatus`: running | completed | failed | paused. */
  status!: string;
  contentId!: string | null;
  text!: string | null;
  imageUrl!: string | null;
  externalRef!: string | null;
}

export class CompetitionEventContentByRefResponseDto {
  contentId!: string;
  pipelineId!: string;
  workflowId!: string;
  bootstrapRuleId!: string;
  externalRef!: string;
  bundleJson!: string;
  currentVersion!: number | null;
}
