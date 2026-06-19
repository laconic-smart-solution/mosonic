import { IsString } from 'class-validator';

export class TopupCreditsDto {
  @IsString()
  packageId: string;
}
