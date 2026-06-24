import { IsString } from 'class-validator';

export class AssignPlanDto {
  @IsString()
  userId: string;
}
