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

export class WhatsAppQrQueryDto {
  /** Defaults to WHATSAPP_BUSINESS_PHONE when omitted. */
  @IsOptional()
  @IsString()
  phone?: string;

  /** Pre-filled chat text (e.g. CONNECT code). */
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(1024)
  size?: number;
}

export class WhatsAppInboundEventDto {
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

export class WhatsAppCallbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppInboundEventDto)
  events!: WhatsAppInboundEventDto[];
}
