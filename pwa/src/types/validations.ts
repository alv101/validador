export type ValidationResult = "ERROR" | "INVALID" | "VALID" | "DUPLICATE";
export type ValidationReason = "NO_REMAINING" | "NOT_FOUND" | "DNI_MISMATCH";

export type ValidateRequest = {
  locator: string;
  serviceId: string;
  itineraryId?: string;
  busNumber?: string;
};

export type ValidateLocatorRequest = {
  locator: string;
  dni: string;
  serviceId: string;
  itineraryId?: string;
  busNumber?: string;
};

export type ValidateResponse = {
  result: ValidationResult;
  reason?: ValidationReason;
  duplicateRecordedAt?: string;
  ticket?: {
    ticketId?: string;
    ref?: string;
    sequence?: number;
    remainingAfter?: number;
  };
  timestamps: {
    createdAt: string; // ISO
    updatedAt: string; // ISO
  };
};
