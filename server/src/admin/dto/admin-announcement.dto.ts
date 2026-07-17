import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AnnouncementLevel } from '@prisma/client';

export class AdminCreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  // 5000 = LINE text message limit; keep both channels within it.
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsEnum(AnnouncementLevel)
  level?: AnnouncementLevel = AnnouncementLevel.info;

  @IsOptional()
  @IsBoolean()
  sendInApp?: boolean = true;

  @IsOptional()
  @IsBoolean()
  sendLine?: boolean = false;
}

export class AdminListAnnouncementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
