import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type { ActiveService } from "@/types/service";

const ACTIVE_SERVICE_KEY = "activeService";

type ActiveServiceContextValue = {
  activeService: ActiveService | null;
  setActiveService: (service: ActiveService) => void;
  clearActiveService: () => void;
};

const ActiveServiceContext = createContext<ActiveServiceContextValue | null>(null);

function loadStoredActiveService(): ActiveService | null {
  const raw = localStorage.getItem(ACTIVE_SERVICE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveService>;
    if (
      typeof parsed.itineraryId !== "string" ||
      typeof parsed.itineraryLabel !== "string" ||
      typeof parsed.departureId !== "string" ||
      typeof parsed.departureDate !== "string" ||
      typeof parsed.departureTime !== "string" ||
      typeof parsed.busNumber !== "string" ||
      typeof parsed.selectedAt !== "string"
    ) {
      return null;
    }

    return {
      itineraryId: parsed.itineraryId,
      itineraryLabel: parsed.itineraryLabel,
      departureId: parsed.departureId,
      departureDate: parsed.departureDate,
      departureTime: parsed.departureTime,
      busNumber: parsed.busNumber,
      selectedAt: parsed.selectedAt,
    };
  } catch {
    return null;
  }
}

export function ActiveServiceProvider({ children }: PropsWithChildren) {
  const [activeService, setActiveServiceState] = useState<ActiveService | null>(() => loadStoredActiveService());

  const setActiveService = useCallback((service: ActiveService) => {
    setActiveServiceState(service);
    localStorage.setItem(ACTIVE_SERVICE_KEY, JSON.stringify(service));
  }, []);

  const clearActiveService = useCallback(() => {
    setActiveServiceState(null);
    localStorage.removeItem(ACTIVE_SERVICE_KEY);
  }, []);

  const value = useMemo<ActiveServiceContextValue>(
    () => ({
      activeService,
      setActiveService,
      clearActiveService,
    }),
    [activeService, clearActiveService, setActiveService],
  );

  return <ActiveServiceContext.Provider value={value}>{children}</ActiveServiceContext.Provider>;
}

export function useActiveService(): ActiveServiceContextValue {
  const context = useContext(ActiveServiceContext);
  if (!context) {
    throw new Error("useActiveService must be used within ActiveServiceProvider");
  }

  return context;
}
