import type { ValidationResult } from "@/types/validations";

export type BackendHistoryEntry = {
  id: number;
  locator: string;
  serviceId: string;
  result: ValidationResult;
  reason?: string;
  ref?: string;
  createdAt: string;
  updatedAt: string;
  actor?: {
    userId: string;
    username?: string;
    roles?: string[];
    dni?: string;
  };
};

export type BackendHistoryResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: BackendHistoryEntry[];
};
