import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../users/schemas/user.schema';

export class AdminUpdateStatusDto {
  @ApiProperty({ example: UserStatus.DISABLED, enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;
}
