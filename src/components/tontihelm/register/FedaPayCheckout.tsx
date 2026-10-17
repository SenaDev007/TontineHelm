"use client";
// TontiHelm — checkout FedaPay intégré (patron Academia Helm, FedaPayCheckout.tsx).
// Widget officiel checkout.js : le paiement se déroule dans une iframe sur la
// page même (Mobile Money MTN MoMo / Moov / carte), sans redirection.
// Doc : https://docs-v1.fedapay.com/payments/checkout
// ⚠ Le callback onComplete n'est PAS cru : c'est le backend qui relit le statut
// réel de la transaction auprès de FedaPay avant d'activer le compte.
import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    FedaPay?: {
      init: (config: {
        public_key: string;
        transaction: { id?: string; amount: number; description: string };
        customer: { email?: string; lastname?: string; firstname?: string; phone_number?: string };
        container: string;
        onComplete?: (transaction: unknown) => void;
        onError?: (error: unknown) => void;
      }) => void;
    };
  }
}

export interface FedaPayCheckoutData {
  public_key: string;
  transaction: { id?: string; amount: number; description: string };
  customer?: { email?: string; lastname?: string; firstname?: string; phone_number?: string };
}

interface FedaPayCheckoutProps {
  checkout: FedaPayCheckoutData;
  onComplete: (transaction: unknown) => void;
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
        transaction: checkout.transaction,
        customer: checkout.customer ?? { lastname: "" },
        container: "#fedapay-checkout-container",
        onComplete: (transaction: unknown) => onComplete(transaction),
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
