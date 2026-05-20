import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class ValidateDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  locator!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  serviceId!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  itineraryId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  busNumber?: string;
}
