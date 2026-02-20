export type RouteOption = { itineraryId: string; label: string };

export type DepartureOption = {
  departureId: string;
  itineraryId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  timeLabel: string; // "08:15"
};

export type BusOption = { busNumber: string; label?: string };

export type ActiveService = {
  itineraryId: string;
  itineraryLabel: string;
  departureId: string;
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  busNumber: string;
  selectedAt: string; // ISO
};
