import type { ValidationResult } from "@/types/validations";

export type ValidationOutcome = ValidationResult | "OFFLINE";

export type HistoryEntry = {
  id: string;
  locator: string;
  serviceId: string;
  outcome: ValidationOutcome;
  at: string;
};
