import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthSignupDto {
  @ApiProperty({ example: 'customer1@laconic.co.th' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'customer1' })
  @IsString()
  @IsNotEmpty()
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
  password: string;
}
