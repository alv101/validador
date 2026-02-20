export type TicketingCheckResult = {
  ok: boolean;
  reason?: string;
  ref?: string;
};

export type TicketingValidateLocatorResult = {
  result: 'VALID' | 'INVALID' | 'DUPLICATE';
  reason?: 'NO_REMAINING' | 'NOT_FOUND' | 'DNI_MISMATCH';
  ticketId?: string;
  sequence?: number;
  remainingAfter?: number;
  ref?: string;
};

export type TicketingLocatorCandidate = {
  ticketKey: string;
  sequence?: number;
  dni?: string;
  ref?: string;
};

export interface TicketingAdapter {
  check(locator: string, serviceId: string): Promise<TicketingCheckResult>;
  validateLocator?: (input: {
    locator: string;
    dni: string;
    serviceId: string | null;
    userId?: string;
  }) => Promise<TicketingValidateLocatorResult>;
  listLocatorCandidates?: (input: {
    locator: string;
    dni: string;
    serviceId: string | null;
  }) => Promise<TicketingLocatorCandidate[]>;
}

export const TICKETING_ADAPTER = Symbol('TICKETING_ADAPTER');
