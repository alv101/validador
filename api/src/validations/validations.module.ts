import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbModule } from '../db/db.module';
import { FakeTicketingAdapter } from './fake-ticketing.adapter';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './service-catalog.service';
import { TICKETING_ADAPTER } from './ticketing.adapter';
import { TicketingSqlServerAdapter } from './ticketing-sqlserver.adapter';
import { TicketingSqlServerService } from './ticketing-sqlserver.service';
import { ValidationsController } from './validations.controller';
import { ValidationsService } from './validations.service';

@Module({
  imports: [DbModule],
  controllers: [ValidationsController, ServiceCatalogController],
  providers: [
    ValidationsService,
    ServiceCatalogService,
    TicketingSqlServerService,
    TicketingSqlServerAdapter,
    FakeTicketingAdapter,
    {
      provide: TICKETING_ADAPTER,
      inject: [ConfigService, FakeTicketingAdapter, TicketingSqlServerAdapter],
      useFactory: (
        config: ConfigService,
        fakeAdapter: FakeTicketingAdapter,
        sqlServerAdapter: TicketingSqlServerAdapter,
      ) => {
        const mode = config.get<string>('TICKETING_ADAPTER_MODE', 'fake');
        return mode === 'sqlserver' ? sqlServerAdapter : fakeAdapter;
      },
    },
  ],
})
export class ValidationsModule {}
