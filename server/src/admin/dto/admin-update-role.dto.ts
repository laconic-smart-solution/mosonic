import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/schemas/user.schema';

export class AdminUpdateRoleDto {
  @ApiProperty({ example: UserRole.CUSTOMER, enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
