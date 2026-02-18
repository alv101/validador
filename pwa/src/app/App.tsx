import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/app/ProtectedRoute";
import { AuthProvider } from "@/features/auth/AuthContext";
import { LoginPage } from "@/features/auth/LoginPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

const LazyScanPage = lazy(async () => {
  const module = await import("@/features/scan/ScanPage");
  return { default: module.ScanPage };
});

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <Suspense fallback={<main className="page page--centered">Cargando scanner...</main>}>
                  <LazyScanPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
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
          <Route path="/" element={<Navigate to="/scan" replace />} />
          <Route path="*" element={<Navigate to="/scan" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
