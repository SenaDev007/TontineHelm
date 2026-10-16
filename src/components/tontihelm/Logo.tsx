// TontiHelm — logo officiel (assets public/logo-tontihelm).
//   · LogoMark      : emblème seul        → écrans connexion / inscription / chargement.
//   · LogoWordmark  : emblème + nom à droite → barres de navigation (navbar, en-têtes).
//   · LogoStacked   : emblème + nom en bas  → pied de page.
//   · LogoAnimated  : emblème animé (flottement + halo) → écran de chargement.
import Image from "next/image";

const SRC_MARK = "/logo-tontihelm/logo-TontiHelm1.png"; // 600×500
const SRC_NAVBAR = "/logo-tontihelm/logo-TontiHelm-nom%20droite1.png"; // 600×236
const SRC_FOOTER = "/logo-tontihelm/logo-TontiHelm-nom%20bas1.png"; // 600×300

export function LogoMark({
  size = 40,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={SRC_MARK}
      alt="Logo TontiHelm"
      width={Math.round(size * (600 / 500))}
      height={size}
      className={className}
      priority={priority}
    />
  );
}

/** Emblème + « TontiHelm » à droite — barres de navigation et en-têtes d'app. */
export function LogoWordmark({
  size = 32,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={SRC_NAVBAR}
      alt="TontiHelm"
      width={Math.round(size * (600 / 236))}
      height={size}
      className={className}
      priority={priority}
    />
  );
}

/** Emblème + « TontiHelm » en dessous — pied de page. */
export function LogoStacked({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={SRC_FOOTER}
      alt="TontiHelm"
      width={Math.round(size * 2)}
      height={size}
      className={className}
    />
  );
}

/** Logo animé — flottement doux et halo pulsé, pour l'écran de chargement. */
export function LogoAnimated({ size = 88 }: { size?: number }) {
  const w = Math.round(size * (600 / 500));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: w, height: size }}>
      <span
        className="absolute inset-[-18%] rounded-full bg-info/10 blur-2xl animate-pulse-soft"
        aria-hidden
      />
      <Image
        src={SRC_MARK}
        alt="TontiHelm"
        width={w}
        height={size}
        className="relative animate-float drop-shadow-lg"
        priority
      />
    </div>
  );
}
