import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AdminTablesQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  limit?: number;
}
