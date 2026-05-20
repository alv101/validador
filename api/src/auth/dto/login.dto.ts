import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class LoginDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;
}
