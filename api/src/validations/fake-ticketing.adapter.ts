import { Injectable } from '@nestjs/common';
import { TicketingAdapter, TicketingCheckResult } from './ticketing.adapter';

@Injectable()
export class FakeTicketingAdapter implements TicketingAdapter {
  async check(locator: string, serviceId: string): Promise<TicketingCheckResult> {
    const normalizedLocator = locator.trim().toUpperCase();
    const normalizedServiceId = serviceId.trim();

    if (normalizedLocator === 'ERROR') {
      throw new Error('Fake adapter failure');
    }

    if (normalizedLocator.startsWith('INV')) {
      return {
        ok: false,
        reason: 'Locator rejected by fake adapter',
      };
    }

    return {
      ok: true,
      ref: `FAKE-${normalizedServiceId}-${normalizedLocator}`,
    };
  }
}
