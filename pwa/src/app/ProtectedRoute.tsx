import { Navigate } from "react-router-dom";
import type { PropsWithChildren } from "react";

import { useAuth } from "@/features/auth/AuthContext";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <main className="page page--centered">Validando sesión...</main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
