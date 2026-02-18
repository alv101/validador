import { Link } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext";
import { getDeviceId } from "@/lib/deviceId";

export function SettingsPage() {
  const { logout } = useAuth();

  return (
    <main className="page">
      <header className="topbar">
        <h1>Settings</h1>
        <nav className="nav-inline">
          <Link to="/scan">Escanear</Link>
          <Link to="/history">Historial</Link>
        </nav>
      </header>

      <section className="card">
        <p>
          <strong>Device ID:</strong> {getDeviceId()}
        </p>
        <button type="button" onClick={logout}>
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
