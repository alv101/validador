export type TicketingCheckResult = {
  ok: boolean;
  reason?: string;
  ref?: string;
};

export interface TicketingAdapter {
  check(locator: string, serviceId: string): Promise<TicketingCheckResult>;
}

export const TICKETING_ADAPTER = Symbol('TICKETING_ADAPTER');
