import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsString,
} from 'class-validator';

export class BulkSchedulePostsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  postIds!: string[];

  @IsDateString()
  scheduledAt!: string;
}
