import { Injectable } from '@nestjs/common';
import {
  TicketingAdapter,
  TicketingCheckResult,
  TicketingLocatorCandidate,
  TicketingValidateLocatorResult,
} from './ticketing.adapter';

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

  async validateLocator(input: {
    locator: string;
    dni: string;
    serviceId: string | null;
  }): Promise<TicketingValidateLocatorResult> {
    const locator = input.locator.trim().toUpperCase();
    const dni = input.dni.trim().toUpperCase();

    if (locator.startsWith('INV')) {
      return { result: 'INVALID', reason: 'NOT_FOUND' };
    }

    if (locator.startsWith('DUP')) {
      return { result: 'DUPLICATE', reason: 'NO_REMAINING', remainingAfter: 0 };
    }

    if (dni.startsWith('000')) {
      return { result: 'INVALID', reason: 'DNI_MISMATCH' };
    }

    return {
      result: 'VALID',
      ticketId: `FAKE-${input.serviceId ?? 'NO-SERVICE'}-${locator}`,
      sequence: 1,
      remainingAfter: 0,
      ref: `FAKE-LOC-${locator}`,
    };
  }

  async listLocatorCandidates(input: {
    locator: string;
    dni: string;
    serviceId: string | null;
  }): Promise<TicketingLocatorCandidate[]> {
    const normalizedLocator = input.locator.trim().toUpperCase();
    const normalizedDni = input.dni.trim().toUpperCase();

    if (normalizedLocator.startsWith('INV')) {
      return [];
    }

    const servicePart = input.serviceId ?? 'NO-SERVICE';
    return [
      { ticketKey: `${servicePart}:${normalizedLocator}:1`, sequence: 1, dni: normalizedDni, ref: 'FAKE-CAND-1' },
      { ticketKey: `${servicePart}:${normalizedLocator}:2`, sequence: 2, dni: normalizedDni, ref: 'FAKE-CAND-2' },
    ];
  }
}
