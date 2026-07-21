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

export class WechatQrQueryDto {
  /** Temporary scene QR string (preferred for CONNECT linking). */
  @IsOptional()
  @IsString()
  sceneStr?: string;

  /** Fallback OA username when no scene_str (profile deep-link QR). */
  @IsOptional()
  @IsString()
  oaUsername?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(1024)
  size?: number;
}

export class WechatInboundEventDto {
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

  @IsOptional()
  @IsString()
  event_key?: string;
}

export class WechatCallbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WechatInboundEventDto)
  events!: WechatInboundEventDto[];
}
