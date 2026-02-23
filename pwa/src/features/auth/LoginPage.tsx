import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { HttpError } from "@/lib/apiClient";
import { useAuth } from "@/features/auth/AuthContext";
import { BrandBar } from "@/components/BrandBar";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/scan" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      if (err instanceof HttpError) {
        setError(`Login falló (${err.status}). Verifica usuario y contraseña.`);
      } else {
        setError("No se pudo iniciar sesión. Intenta nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page page--centered">
      <BrandBar />
      <section className="card">
        <h1>Iniciar sesión</h1>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="stack">
            Usuario
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="stack">
            Contraseña
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button disabled={loading} type="submit">
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        {error ? <p className="text-error">{error}</p> : null}
      </section>
    </main>
  );
}
