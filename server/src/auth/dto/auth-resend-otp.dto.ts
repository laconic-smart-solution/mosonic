import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthResendOtpDto {
  @ApiProperty({ example: 'customer1@laconic.co.th' })
  @IsEmail()
  email: string;
}
