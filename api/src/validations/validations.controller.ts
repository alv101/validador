import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ValidationsService } from './validations.service';

type ValidateBody = {
  locator: string;
  serviceId: string;
};

@Controller('validate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
export class ValidationsController {
  constructor(private readonly validationsService: ValidationsService) {}

  @Post()
  validate(@Body() body: ValidateBody) {
    return this.validationsService.validate(body);
  }
}
