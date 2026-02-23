import { useState } from "react";

export function BrandBar() {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <div className="brand-bar" role="banner" aria-label="Identidad corporativa">
      {!hasImageError ? (
        <img
          className="brand-bar__image"
          src="/logo_avanza_blanco_morado.jpeg"
          alt="Avanza by Mobility ADO"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="brand-bar__logo">
          <span className="brand-bar__wordmark">avanza</span>
          <span className="brand-bar__sub">by mobility ado</span>
        </div>
      )}
    </div>
  );
}
