import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { FakeTicketingAdapter } from './fake-ticketing.adapter';
import { TICKETING_ADAPTER } from './ticketing.adapter';
import { ValidationsController } from './validations.controller';
import { ValidationsService } from './validations.service';

@Module({
  imports: [DbModule],
  controllers: [ValidationsController],
  providers: [
    ValidationsService,
    FakeTicketingAdapter,
    {
      provide: TICKETING_ADAPTER,
      useExisting: FakeTicketingAdapter,
    },
  ],
})
export class ValidationsModule {}
