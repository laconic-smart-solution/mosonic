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

export class ViberQrQueryDto {
  /** Defaults to VIBER_URI when omitted. */
  @IsOptional()
  @IsString()
  uri?: string;

  /** Optional deep-link start / context payload for QR. */
  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(1024)
  size?: number;
}

export class ViberInboundEventDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  message_id?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

export class ViberCallbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ViberInboundEventDto)
  events!: ViberInboundEventDto[];
}
