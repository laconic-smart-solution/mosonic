import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Multipart form fields arrive as strings ("true"/"false"), not booleans. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class AdminCreateImageDesignStyleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/, {
    message: 'key must be lowercase alphanumeric with - or _ separators',
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

export class AdminUpdateImageDesignStyleDto {
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
