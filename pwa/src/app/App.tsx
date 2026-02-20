import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/app/ProtectedRoute";
import { AuthProvider } from "@/features/auth/AuthContext";
import { AdminLiveMonitorPage } from "@/features/history/AdminLiveMonitorPage";
import { BackendHistoryPage } from "@/features/history/BackendHistoryPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ActiveServiceProvider } from "@/features/service/ActiveServiceContext";
import { RequireActiveService } from "@/features/service/RequireActiveService";
import { ServiceSelectPage } from "@/features/service/ServiceSelectPage";

const LazyScanPage = lazy(async () => {
  const module = await import("@/features/scan/ScanPage");
  return { default: module.ScanPage };
});

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ActiveServiceProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/service"
              element={
                <ProtectedRoute allowedRoles={["admin", "driver"]}>
                  <ServiceSelectPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scan"
              element={
                <ProtectedRoute>
                  <RequireActiveService>
                    <Suspense fallback={<main className="page page--centered">Cargando scanner...</main>}>
                      <LazyScanPage />
                    </Suspense>
                  </RequireActiveService>
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <BackendHistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history/backend"
              element={
                <ProtectedRoute>
                  <BackendHistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/live"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminLiveMonitorPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/scan" replace />} />
            <Route path="*" element={<Navigate to="/scan" replace />} />
          </Routes>
        </ActiveServiceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
