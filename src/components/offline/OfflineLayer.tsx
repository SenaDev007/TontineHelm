"use client";
// TontiHelm — couche d'interface offline-first, montée sur TOUTES les vues :
//   · enregistre le service worker (site consultable hors ligne) ;
//   · branche les déclencheurs de synchronisation (retour réseau, cycle 30 s) ;
//   · bannière hors ligne (ambre) + pastille de file d'envoi (bas de page) ;
//   · accuse la fin de synchronisation (« Tout est synchronisé »).
import { useCallback, useEffect, useRef, useState } from "react";
import { flushOutbox, initOfflineSync } from "@/lib/offline/sync";
import { outboxClearFailed, outboxCounts } from "@/lib/offline/idb";
import { toast } from "@/hooks/use-toast";
import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type Counts = { pending: number; failed: number };

export function OfflineLayer() {
  const [online, setOnline] = useState(true);
  const [counts, setCounts] = useState<Counts>({ pending: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);
  const lastSyncToast = useRef(0);

  // ── Service worker + moteur de synchronisation ──
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    initOfflineSync();
  }, []);

  // ── État réseau ──
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ── Compteurs de la file + événements du moteur ──
  useEffect(() => {
    const refresh = () => {
      outboxCounts().then(setCounts).catch(() => undefined);
    };
    refresh();
    const onSyncStart = () => setSyncing(true);
    const onSyncDone = (e: Event) => {
      setSyncing(false);
      refresh();
      const detail = (e as CustomEvent<{ synced: number; failed: number }>).detail;
      if (detail && detail.synced > 0) {
        // Anti-spam : un toast par salve, 5 s d'écart minimum.
        if (Date.now() - lastSyncToast.current > 5000) {
          lastSyncToast.current = Date.now();
          toast({
            title: "Tout est synchronisé.",
            description:
              detail.failed > 0
                ? `${detail.synced} opération(s) envoyée(s), ${detail.failed} refusée(s) par le serveur.`
                : `${detail.synced} opération(s) envoyée(s) au serveur.`,
          });
        }
      }
    };
    window.addEventListener("tontihelm:outbox-changed", refresh);
    window.addEventListener("tontihelm:sync-start", onSyncStart);
    window.addEventListener("tontihelm:sync-done", onSyncDone);
    return () => {
      window.removeEventListener("tontihelm:outbox-changed", refresh);
      window.removeEventListener("tontihelm:sync-start", onSyncStart);
      window.removeEventListener("tontihelm:sync-done", onSyncDone);
    };
  }, []);

  const forceSync = useCallback(async () => {
    if (!navigator.onLine) {
      toast({ title: "Toujours hors ligne", description: "La synchronisation partira au retour du réseau." });
      return;
    }
    const res = await flushOutbox();
    if (res.remaining === 0 && res.synced === 0 && res.failed === 0) {
      toast({ title: "Rien à envoyer.", description: "Toutes tes opérations sont déjà synchronisées." });
    }
  }, []);

  const dismissFailed = useCallback(async () => {
    await outboxClearFailed();
    setCounts({ pending: 0, failed: 0 });
    toast({ title: "Opérations en échec ignorées." });
  }, []);

  const total = counts.pending + counts.failed;

  return (
    <>
      {/* Bannière hors ligne — EN FLUX avant le contenu : pousse la page,
          ne chevauche jamais les barres collantes. Visible sur toutes les vues. */}
      <AnimatePresence>
        {!online && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-b border-[#F0D48A] bg-[#FFF4D6]"
            role="status"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-[1200px] items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-[#A66A00]">
              <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Pas de réseau — le site et tes données restent consultables. Les saisies partent au retour
                du signal.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pastille de synchronisation (bas de page) */}
      <AnimatePresence>
        {total > 0 && (
          <motion.button
            type="button"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={forceSync}
            className={`fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold shadow-lg backdrop-blur transition-transform active:scale-95 ${
              counts.failed > 0 && counts.pending === 0
                ? "border-[#F0C1BD] bg-[#FDECEA] text-[#B3261E]"
                : "border-[#C5D8ED] bg-white/95 text-[#0B6BCB] hover:-translate-y-0.5"
            }`}
            aria-label={`${counts.pending} opération(s) en attente d'envoi${counts.failed > 0 ? `, ${counts.failed} en échec` : ""}`}
          >
            {syncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            ) : counts.failed > 0 && counts.pending === 0 ? (
              <AlertTriangle className="h-4 w-4" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {counts.pending > 0 && (
              <span>
                {counts.pending} en attente d&apos;envoi
                {counts.failed > 0 && ` · ${counts.failed} en échec`}
              </span>
            )}
            {counts.pending === 0 && counts.failed > 0 && <span>{counts.failed} opération(s) en échec</span>}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bouton d'oubli des échecs (après refus métier) */}
      <AnimatePresence>
        {counts.failed > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissFailed}
            className="fixed bottom-4 left-4 z-[60] inline-flex items-center gap-1.5 rounded-full border border-[#F0C1BD] bg-[#FDECEA] px-3 py-2 text-xs font-medium text-[#B3261E] shadow-md"
          >
            Ignorer les échecs
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
