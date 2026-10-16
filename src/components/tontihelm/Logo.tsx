// TontiHelm — logo : écu protecteur portant la roue de gouvernail à huit rayons
// (piloter et protéger la tontine), moyeu or — la couleur d'accent ne se pose
// jamais sur le fond d'accent (§13.2, note de production).
// Géométrie identique à public/logo.svg (favicon) pour une identité cohérente.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Logo TontiHelm"
      className={className}
    >
      <defs>
        <linearGradient id="thg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1A8A5C" />
          <stop offset="1" stopColor="#0C5B3B" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#thg)" />
      <path
        d="M21 14.5 H43 Q46 14.5 46 17.5 V30 C46 40.2 40.2 47 32 50.8 C23.8 47 18 40.2 18 30 V17.5 Q18 14.5 21 14.5 Z"
        fill="#FFFFFF"
      />
      <g stroke="#0F6B4A" strokeWidth="3.4" strokeLinecap="round" fill="none">
        <circle cx="32" cy="29.5" r="8.2" />
        <line x1="32" y1="17.5" x2="32" y2="24.7" />
        <line x1="32" y1="34.3" x2="32" y2="41.5" />
        <line x1="20" y1="29.5" x2="27.2" y2="29.5" />
        <line x1="36.8" y1="29.5" x2="44" y2="29.5" />
        <line x1="23.51" y1="21.02" x2="28.61" y2="26.11" />
        <line x1="40.49" y1="21.02" x2="35.39" y2="26.11" />
        <line x1="23.51" y1="37.98" x2="28.61" y2="32.89" />
        <line x1="40.49" y1="37.98" x2="35.39" y2="32.89" />
      </g>
      <circle cx="32" cy="29.5" r="3.6" fill="#C8962E" />
    </svg>
  );
}

export function LogoWordmark({ onDark = false, size = 32 }: { onDark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className={`font-display font-bold tracking-tight ${
          onDark ? "text-white" : "text-ink"
        }`}
        style={{ fontSize: size * 0.62 }}
      >
        Tonti<span className={onDark ? "text-accent" : "text-primary"}>Helm</span>
      </span>
    </span>
  );
}
