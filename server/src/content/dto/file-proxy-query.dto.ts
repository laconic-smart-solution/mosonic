import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class FileProxyQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  relativePath!: string;
}
