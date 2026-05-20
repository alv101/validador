import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const VALIDATION_RESULTS = ['VALID', 'INVALID', 'DUPLICATE', 'ERROR'] as const;

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class HistoryQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  locator?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  serviceId?: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed.toUpperCase();
  })
  @IsOptional()
  @IsIn(VALIDATION_RESULTS)
  result?: string;
}
