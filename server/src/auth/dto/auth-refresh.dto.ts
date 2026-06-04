import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthRefreshDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.REFRESH_TOKEN_HERE',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
