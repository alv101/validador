import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ValidationsService } from './validations.service';

type ValidateBody = {
  locator: string;
  serviceId: string;
};

type ValidationHistoryQuery = {
  page?: string;
  pageSize?: string;
  dateFrom?: string;
  dateTo?: string;
  locator?: string;
  serviceId?: string;
  result?: string;
};

type AdminTablesQuery = {
  limit?: string;
};

type ValidateLocatorBody = {
  locator: string;
  dni: string;
  serviceId?: string;
};

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

  @Post('validate')
  validate(@Body() body: ValidateBody) {
    return this.validationsService.validate(body);
  }

  @Get('validations/history')
  listHistory(@Query() query: ValidationHistoryQuery, @CurrentUser() user: JwtUser) {
    return this.validationsService.listValidations({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      locator: query.locator,
      serviceId: query.serviceId,
      result: query.result,
      actorUserId: user?.userId,
      actorRoles: user?.roles,
    });
  }

  @Post('validate-locator')
  validateLocator(
    @Body() body: ValidateLocatorBody,
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
  listValidationTables(@Query() query: AdminTablesQuery) {
    return this.validationsService.getValidationTablesSnapshot(query.limit ? Number(query.limit) : undefined);
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
