import { Navigate } from "react-router-dom";
import type { PropsWithChildren } from "react";

import { useAuth } from "@/features/auth/AuthContext";

type ProtectedRouteProps = PropsWithChildren<{
  allowedRoles?: string[];
}>;

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, me } = useAuth();

  if (isLoading) {
    return <main className="page page--centered">Validando sesión...</main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const roleList = me?.roles ?? me?.user?.roles ?? [];
    const allowedSet = new Set(allowedRoles.map((role) => role.toLowerCase()));
    const isAllowed = roleList.some((role) => allowedSet.has(role.toLowerCase()));

    if (!isAllowed) {
      return (
        <main className="page page--centered">
          <section className="card">
            <h1>403</h1>
            <p>No tienes permisos para acceder a esta pantalla.</p>
          </section>
        </main>
      );
    }
  }

  return <>{children}</>;
}
