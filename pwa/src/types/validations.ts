export type ValidationResult = "ERROR" | "INVALID" | "VALID" | "DUPLICATE";

export type ValidateRequest = {
  locator: string;
  serviceId: string;
};

export type ValidateResponse = {
  result: ValidationResult;
  timestamps: {
    createdAt: string; // ISO
    updatedAt: string; // ISO
  };
};
