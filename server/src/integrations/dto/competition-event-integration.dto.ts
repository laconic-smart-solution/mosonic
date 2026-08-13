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

export class CompetitionEventContentByRefResponseDto {
  contentId!: string;
  pipelineId!: string;
  workflowId!: string;
  bootstrapRuleId!: string;
  externalRef!: string;
  bundleJson!: string;
  currentVersion!: number | null;
}
