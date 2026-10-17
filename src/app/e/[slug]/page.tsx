"use client";
// TontiHelm — portail dédié d'une entité : /e/{slug} (2026-10).
// Chaque PME / groupement / particulier possède SON lien : ses gérants et ses
// agents collecteurs s'y connectent, dans un espace clairement rattaché à leur
// structure. Les clients, eux, suivent leurs carnets depuis leurs liens
// personnels /e/{slug}/carnet/{token} — tout reste relié à cette entreprise.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/tontihelm/auth/LoginScreen";
import { LogoMark } from "@/components/tontihelm/Logo";
import { get } from "@/lib/client";

interface EntityInfo {
  name: string;
  kind: string;
  city: string | null;
}

export default function EntityPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const [slug, setSlug] = useState<string | null>(null);
  const [entity, setEntity] = useState<EntityInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void params.then((p) => {
      setSlug(p.slug);
      get<EntityInfo>(`/api/public/entities/${p.slug}`)
        .then((d) => setEntity(d))
        .catch(() => setNotFound(true));
    });
  }, [params]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
        <LogoMark size={64} />
        <h1 className="font-display text-lg font-bold text-ink">Entité introuvable</h1>
        <p className="max-w-sm text-sm leading-relaxed text-subtle">
          Ce lien dédié n&apos;existe pas ou plus. Vérifie auprès de ta structure de collecte, ou
          connecte-toi depuis la page habituelle.
        </p>
        <a href="/connexion" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Aller à la connexion générale
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {entity && (
        <div className="border-b border-primary/20 bg-[#EEF4FD]">
          <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-4 py-2.5 text-center">
            <LogoMark size={26} />
            <p className="text-xs font-medium text-primary">
              Lien dédié de <span className="font-bold">{entity.name}</span>
              {entity.city ? ` · ${entity.city}` : ""}
            </p>
          </div>
        </div>
      )}
      <LoginScreen
        entityName={entity?.name ?? null}
        onBack={() => router.push("/")}
        onLoggedIn={() => router.push("/")}
      />
    </div>
  );
}
