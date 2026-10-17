"use client";
// TontiHelm — repli checkout FedaPay intégré (patron Academia Helm, FedaPayCheckout.tsx).
// ⚠ PRIMAIRE : la page de paiement HÉBERGÉE FedaPay (paiementUrl renvoyé par le
// backend) — redirection pleine page. Ce widget n'est qu'un REPLI quand cette
// URL est indisponible : il reçoit amount + description (+ client) SANS
// identifiant de transaction — l'iframe crée alors sa propre transaction et
// rapporte son id via onComplete ; le statut est toujours revérifié côté serveur.
// Doc : https://docs-v1.fedapay.com/payments/checkout
import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    FedaPay?: {
      init: (config: {
        public_key: string;
        environment?: "live" | "sandbox";
        transaction: { amount: number; description: string };
        customer: { email?: string; lastname?: string; firstname?: string; phone_number?: string };
        container: string;
        onComplete?: (payload: unknown) => void;
        onError?: (error: unknown) => void;
      }) => void;
    };
  }
}

export interface FedaPayCheckoutData {
  public_key: string;
  /** Force l'environnement du widget (doit suivre celui des clés) — sinon le
   * widget le déduit du préfixe de la clé publique. */
  environment?: "live" | "sandbox";
  transaction: { amount: number; description: string };
  customer?: { email?: string; lastname?: string; firstname?: string; phone_number?: string };
}

interface FedaPayCheckoutProps {
  checkout: FedaPayCheckoutData;
  /** Reçoit le message du widget ({ reason, transaction }) — seule la
   * transaction (et son id) est exploitée, jamais le statut annoncé. */
  onComplete: (payload: unknown) => void;
  onError: (error: unknown) => void;
}

export function FedaPayCheckout({ checkout, onComplete, onError }: FedaPayCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Chargement du script checkout.js de FedaPay (une seule fois par page).
  useEffect(() => {
    if (document.querySelector('script[src*="fedapay.com/checkout.js"]')) {
      setScriptLoaded(true);
      setIsLoading(false);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.fedapay.com/checkout.js?v=1.1.7";
    script.async = true;
    script.onload = () => {
      setScriptLoaded(true);
      setIsLoading(false);
    };
    script.onerror = () => {
      setError("Impossible de charger le module de paiement FedaPay. Vérifie ta connexion.");
      setIsLoading(false);
    };
    document.head.appendChild(script);
  }, []);

  // Initialisation du widget une fois le script disponible.
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !checkout.public_key) return;
    if (!window.FedaPay) {
      setError("Le module de paiement FedaPay n'est pas disponible.");
      return;
    }
    try {
      window.FedaPay.init({
        public_key: checkout.public_key,
        ...(checkout.environment ? { environment: checkout.environment } : {}),
        transaction: checkout.transaction,
        customer: checkout.customer ?? { lastname: "" },
        container: "#fedapay-checkout-container",
        onComplete: (payload: unknown) => onComplete(payload),
        onError: (err: unknown) => {
          const message =
            (err as { message?: string } | null)?.message ?? "Erreur lors du paiement. Réessaie.";
          setError(message);
          onError(err);
        },
      });

      // L'iframe FedaPay fixe sa propre hauteur : on la laisse respirer pour
      // éviter tout ascenseur interne tronqué (leçon Academia Helm).
      const ensureFullHeight = () => {
        const container = document.getElementById("fedapay-checkout-container");
        if (!container) return;
        container.style.height = "auto";
        container.style.minHeight = "auto";
        container.style.maxHeight = "none";
        container.style.overflow = "visible";
        const iframe = container.querySelector("iframe");
        if (iframe) {
          iframe.style.minHeight = "560px";
          iframe.style.maxHeight = "none";
          iframe.style.overflow = "visible";
        }
      };
      ensureFullHeight();
      const timers = [300, 1000, 2500].map((ms) => setTimeout(ensureFullHeight, ms));
      const observer = new MutationObserver(ensureFullHeight);
      observer.observe(document.getElementById("fedapay-checkout-container") ?? containerRef.current, {
        childList: true,
        subtree: true,
      });
      return () => {
        timers.forEach(clearTimeout);
        observer.disconnect();
      };
    } catch (err) {
      const message =
        (err as { message?: string } | null)?.message ??
        "Erreur lors de l'initialisation du paiement.";
      setError(message);
      onError(err);
    }
  }, [scriptLoaded, checkout, onComplete, onError]);

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-lg border border-line bg-white p-8"
        role="status"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="mt-3 text-sm text-subtle">Chargement du formulaire de paiement…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border-2 border-danger/40 bg-danger/5 p-5" role="alert">
        <p className="flex items-start gap-2 text-sm font-medium text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        #fedapay-checkout-container {
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
          overflow: visible !important;
        }
        #fedapay-checkout-container iframe {
          max-height: none !important;
          overflow: visible !important;
        }
      `}</style>
      <div id="fedapay-checkout-container" ref={containerRef} className="w-full" />
    </>
  );
}
