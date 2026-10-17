"use client";
// TontiHelm — pied de page professionnel : identité, liens produit et légaux,
// contact réel de YEHI OR Tech (Parakou, Bénin) + réseaux sociaux de l'entreprise.
import { LogoStacked } from "../Logo";
import { motion, useReducedMotion } from "framer-motion";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

/* ── Icônes de réseaux sociaux (SVG de marque, couleur officielle au survol) ── */
function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073c0 6.025 4.388 11.02 10.125 11.927V15.56H7.078v-3.487h3.047V9.414c0-3.007 1.792-4.669 4.533-4.669 1.313 0 2.686.236 2.686.236v2.953h-1.514c-1.491 0-1.956.93-1.956 1.885v2.254h3.328l-.532 3.487h-2.796V24C19.612 23.093 24 18.098 24 12.073z" />
    </svg>
  );
}
function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.447 20.452H16.89v-5.569c0-1.328-.025-3.037-1.851-3.037-1.854 0-2.136 1.446-2.136 2.939v5.667H9.346V9h3.415v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.603 0 4.268 2.372 4.268 5.455v6.286zM5.337 7.433a2.063 2.063 0 1 1 0-4.126 2.063 2.063 0 0 1 0 4.126zM7.119 20.452H3.553V9H7.12v11.452z" />
    </svg>
  );
}
function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}
function YouTubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M23.498 6.186a2.997 2.997 0 0 0-2.11-2.12C19.503 3.5 12 3.5 12 3.5s-7.504 0-9.388.565a2.997 2.997 0 0 0-2.11 2.12A31.21 31.21 0 0 0 0 12a31.21 31.21 0 0 0 .502 5.814 2.997 2.997 0 0 0 2.11 2.12C4.496 20.5 12 20.5 12 20.5s7.503 0 9.388-.565a2.997 2.997 0 0 0 2.11-2.12A31.21 31.21 0 0 0 24 12a31.21 31.21 0 0 0-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

const SOCIALS = [
  { name: "Facebook", href: "https://www.facebook.com/yehiortec/", Icon: FacebookIcon, brand: "#1877F2" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/yehiortech/", Icon: LinkedInIcon, brand: "#0077B5" },
  { name: "WhatsApp", href: "https://wa.me/2290141360803", Icon: WhatsAppIcon, brand: "#25D366" },
  { name: "YouTube", href: "https://www.youtube.com/@yehiortech", Icon: YouTubeIcon, brand: "#FF0000" },
];

const PRODUCT_LINKS = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "Démonstration en direct", href: "#demonstration" },
  { label: "Questions fréquentes", href: "#questions" },
  { label: "Inscrire ma structure", href: "/inscription" },
  { label: "Se connecter", href: "/connexion" },
];

const LEGAL_LINKS = [
  { label: "Conditions d'utilisation", href: "/conditions-utilisation" },
  { label: "Politique de confidentialité", href: "/confidentialite" },
  { label: "Mentions légales", href: "/mentions-legales" },
];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="group inline-flex items-center gap-2 text-sm text-[#AFC2DE] transition-colors hover:text-white">
              <span className="h-1 w-1 rounded-full bg-[#4A5E80] transition-colors group-hover:bg-gold" aria-hidden />
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const reduce = useReducedMotion();
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden bg-[#0A1428] text-[#AFC2DE]">
      {/* Halo discret en haut du footer */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(0,143,245,0.10),transparent_70%)]" aria-hidden />

      <div className="relative mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[300px_1fr_170px_260px]">
          {/* Identité */}
          <div>
            <div className="flex h-[104px] w-52 items-center justify-center rounded-2xl bg-white p-4 shadow-lg shadow-black/25">
              <LogoStacked size={68} />
            </div>
            <p className="mt-5 max-w-[260px] text-sm leading-relaxed">
              L&apos;application béninoise de gestion de tontines journalières. Le carnet papier,
              en version qui ne se perd jamais.
            </p>
            {/* Réseaux sociaux */}
            <div className="mt-5 flex items-center gap-2.5">
              {SOCIALS.map((s) => (
                <motion.a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Suivre YEHI OR Tech sur ${s.name}`}
                  whileHover={reduce ? undefined : { y: -4, scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  style={{ ["--brand" as string]: s.brand }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2A3B5C] bg-[#101F3A] text-[#AFC2DE] transition-colors duration-200 hover:border-(--brand) hover:bg-(--brand) hover:text-white"
                >
                  <s.Icon className="h-[18px] w-[18px]" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Produit */}
          <FooterColumn title="Produit" links={PRODUCT_LINKS} />

          {/* Légal */}
          <FooterColumn title="Légal" links={LEGAL_LINKS} />

          {/* Contact entreprise */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Contact</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a href="https://wa.me/2290141360803" target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 transition-colors hover:text-white">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span>
                    WhatsApp / Appel
                    <span className="block text-[#7C90B0]">+229 01 41 36 08 03</span>
                  </span>
                </a>
              </li>
              <li>
                <a href="mailto:contact@yehiortech.com" className="flex items-start gap-2.5 transition-colors hover:text-white">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span>contact@yehiortech.com</span>
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                <span>
                  YEHI OR Tech
                  <span className="block text-[#7C90B0]">Parakou, République du Bénin</span>
                </span>
              </li>
            </ul>
            <div className="mt-5 rounded-lg border border-[#2A3B5C] bg-[#101F3A] p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-[#DCE6F5]">
                <Phone className="h-3.5 w-3.5 text-gold" aria-hidden />
                Support paliers Pro &amp; Institution : sous 24 h
              </p>
            </div>
          </div>
        </div>

        {/* Barre du bas */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[#1D2C48] pt-6 text-center md:flex-row md:text-left">
          <p className="text-xs text-[#7C90B0]">
            © {year} TontiHelm — un produit de YEHI OR Tech · Parakou, République du Bénin.
          </p>
          <p className="text-xs text-[#7C90B0]">
            Conforme au Code du numérique de la République du Bénin · Données hébergées sécurisées
          </p>
        </div>
      </div>
    </footer>
  );
}
