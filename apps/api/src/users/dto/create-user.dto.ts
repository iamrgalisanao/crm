import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleKeys!: string[];
}
