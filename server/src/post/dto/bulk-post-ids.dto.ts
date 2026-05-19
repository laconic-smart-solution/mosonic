import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BulkPostIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  postIds!: string[];
}
