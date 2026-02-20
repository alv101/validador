import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useActiveService } from "@/features/service/ActiveServiceContext";

export function RequireActiveService({ children }: PropsWithChildren) {
  const { activeService } = useActiveService();

  if (!activeService) {
    return <Navigate to="/service" replace />;
  }

  return <>{children}</>;
}
