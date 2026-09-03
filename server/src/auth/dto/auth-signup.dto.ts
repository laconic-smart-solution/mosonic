import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthSignupDto {
  @ApiProperty({ example: 'customer1@laconic.co.th' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'customer1' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  username: string;

  @ApiProperty({ example: 'Customer', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'One', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: '+66123456789', required: false })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}
