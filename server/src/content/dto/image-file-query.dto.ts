import {
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateBy,
  ValidationArguments,
} from 'class-validator';

export class ImageFileQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  @ValidateBy({
    name: 'imageNoPathTraversal',
    validator: {
      validate(value: unknown): boolean {
        return typeof value === 'string' && !value.includes('..');
      },
      defaultMessage(args: ValidationArguments) {
        return `${args.property} must not contain ..`;
      },
    },
  })
  image!: string;
}
