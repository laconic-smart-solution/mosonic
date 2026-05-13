import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthChangePasswordDto {
  @ApiProperty({ example: 'NewP@ssw0rd123' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
