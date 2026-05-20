import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, minutes } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ValidationsService } from './validations.service';
import { AdminTablesQueryDto } from './dto/admin-tables-query.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { ValidateLocatorDto } from './dto/validate-locator.dto';
import { ValidateDto } from './dto/validate.dto';

type JwtUser = {
  userId?: string;
  username?: string;
  roles?: string[];
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER', 'ADMIN')
@Controller()
export class ValidationsController {
  constructor(private readonly validationsService: ValidationsService) {}

  @Throttle({ default: { limit: 120, ttl: minutes(1) } })
  @Post('validate')
  validate(@Body() body: ValidateDto) {
    return this.validationsService.validate(body);
  }

  @Get('validations/history')
  listHistory(@Query() query: HistoryQueryDto, @CurrentUser() user: JwtUser) {
    return this.validationsService.listValidations({
      page: query.page,
      pageSize: query.pageSize,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      locator: query.locator,
      serviceId: query.serviceId,
      result: query.result,
      actorUserId: user?.userId,
      actorRoles: user?.roles,
    });
  }

  @Throttle({ default: { limit: 180, ttl: minutes(1) } })
  @Post('validate-locator')
  validateLocator(
    @Body() body: ValidateLocatorDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.validationsService.validateLocator(body, {
      idempotencyKey,
      userId: user?.userId,
      username: user?.username,
      roles: user?.roles,
    });
  }

  @Roles('ADMIN')
  @Get('validations/admin/reset-status')
  resetValidationStatus() {
    return this.validationsService.getResetValidationStatus();
  }

  @Roles('ADMIN')
  @Get('validations/admin/tables')
  listValidationTables(@Query() query: AdminTablesQueryDto) {
    return this.validationsService.getValidationTablesSnapshot(query.limit);
  }

  @Roles('ADMIN')
  @Post('validations/admin/reset')
  resetValidationData(
    @CurrentUser() user: JwtUser,
    @Headers('x-reset-admin-key') resetAdminKey: string | undefined,
    @Req() req: { ip?: string },
  ) {
    return this.validationsService.resetValidationData({
      actorUserId: user?.userId,
      actorUsername: user?.username,
      actorRoles: user?.roles,
      ip: req?.ip,
      resetAdminKey,
    });
  }
}
