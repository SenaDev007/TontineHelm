// TontiHelm — logo : barre de gouvernail à huit rayons (pilotage de la tontine).
// Le carré vert ne se pose jamais sur la couleur d'accent (§13.2, note de production).
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Logo TontiHelm"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#0F6B4A" />
      <g stroke="#FFFFFF" strokeWidth="1.75" strokeLinecap="round">
        <circle cx="16" cy="16" r="7.5" fill="none" />
        <line x1="16" y1="5.5" x2="16" y2="10.5" />
        <line x1="16" y1="21.5" x2="16" y2="26.5" />
        <line x1="5.5" y1="16" x2="10.5" y2="16" />
        <line x1="21.5" y1="16" x2="26.5" y2="16" />
        <line x1="8.6" y1="8.6" x2="11.3" y2="11.3" />
        <line x1="20.7" y1="20.7" x2="23.4" y2="23.4" />
        <line x1="23.4" y1="8.6" x2="20.7" y2="11.3" />
        <line x1="11.3" y1="20.7" x2="8.6" y2="23.4" />
      </g>
      <circle cx="16" cy="16" r="2.4" fill="#C8962E" />
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
        TontiHelm
      </span>
    </span>
  );
}
