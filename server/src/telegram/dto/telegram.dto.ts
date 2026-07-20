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

export class TelegramQrQueryDto {
  /** Defaults to TELEGRAM_BOT_USERNAME when omitted. */
  @IsOptional()
  @IsString()
  botUsername?: string;

  /** Optional deep-link start payload (`https://t.me/Bot?start=…`). */
  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(1024)
  size?: number;
}

export class TelegramInboundEventDto {
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

export class TelegramCallbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelegramInboundEventDto)
  events!: TelegramInboundEventDto[];
}
