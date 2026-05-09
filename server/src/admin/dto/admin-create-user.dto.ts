import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/schemas/user.schema';

export class AdminCreateUserDto {
  @ApiProperty({ example: 'admin2@laconic.co.th' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin2' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'Admin', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'User', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: UserRole.ADMIN, enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
