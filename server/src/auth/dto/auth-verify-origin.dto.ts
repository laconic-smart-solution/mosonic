import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthVerifyOriginDto {
  @ApiProperty({ example: 'a1b2c3d4e5f6789012345678abcdef01' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
