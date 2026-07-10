import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminCreateTopupPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  label!: string;

  @IsInt()
  @Min(1)
  credits!: number;

  @IsNumber()
  @Min(0)
  priceUsd!: number;

  @IsNumber()
  @Min(0.01)
  priceThb!: number;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsBoolean()
  active!: boolean;
}

export class AdminUpdateTopupPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  label!: string;

  @IsInt()
  @Min(1)
  credits!: number;

  @IsNumber()
  @Min(0)
  priceUsd!: number;

  @IsNumber()
  @Min(0.01)
  priceThb!: number;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsBoolean()
  active!: boolean;
}

export class AdminUpdateTopupPlanActiveDto {
  @IsBoolean()
  active!: boolean;
}
