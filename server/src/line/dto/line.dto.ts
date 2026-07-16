import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineQrQueryDto {
  /** Defaults to LINE_BASIC_ID when omitted. */
  @IsOptional()
  @IsString()
  basicId?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(1024)
  size?: number;
}

export class LineInboundEventDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  reply_token?: string;

  @IsOptional()
  @IsString()
  message_id?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

export class LineCallbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineInboundEventDto)
  events!: LineInboundEventDto[];
}
