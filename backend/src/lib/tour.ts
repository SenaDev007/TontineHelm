// TontiHelm — sérialisation de tournée (phase 1) : fenêtre encaissable et arrêt
// de tournée du livret. Extraits À L'IDENTIQUE de routes/agent.ts pour
// être partagés entre /api/agent/* (web, inchangé) et /v1/sync/* (mobile) —
// même code, mêmes formes de réponse, zéro divergence de calcul.
// Durée de cycle paramétrable (§8.14) : le carnet porte sa durée, la fenêtre
// et les positions suivent — 372 (livret annuel) par défaut.
import { passbookBalance } from "./domain";
import { buildLivret, clampCycleDays, linePosition, serializeLivret } from "./livret";

/** Fenêtre de lignes encaissables envoyée à l'écran d'encaissement (dues + avance). */
export function payableWindow(livret: ReturnType<typeof buildLivret>, count = 40) {
  const out: { line: number; sheet: number; lineInSheet: number; company: boolean; label: string }[] = [];
  const cycleDays = clampCycleDays(livret.cycleDays);
  // Livret entièrement réglé : aucune ligne à proposer.
  if (livret.lineDue > cycleDays) return out;
  const start = Math.min(livret.lineDue, cycleDays);
  for (let line = start; line < start + count && line <= cycleDays; line += 1) {
    const pos = linePosition(line, cycleDays);
    const sheet = livret.sheets[pos.sheet - 1];
    out.push({
      line,
      sheet: pos.sheet,
      lineInSheet: pos.lineInSheet,
      company: pos.company,
      label: pos.company ? `Mise entreprise — ${sheet?.shortLabel ?? ""}` : `Ligne ${pos.lineInSheet}`,
    });
  }
  return out;
}

/** Sérialisation « arrêt de tournée » d'un carnet (livret à durée paramétrable). */
export function livretStop(
  pb: {
    id: string;
    number: string;
    label: string | null;
    dailyAmount: number;
    startsOn: Date;
    status: string;
    /** Durée du cycle en lignes (§8.14) — 372 par défaut. */
    cycleDays?: number | null;
  },
  collections: { amount: number }[],
  lateThreshold: number
) {
  const balance = passbookBalance(collections);
  const livret = buildLivret(pb, balance);
  const current = livret.sheets[livret.currentSheet - 1];
  const cycleDays = clampCycleDays(livret.cycleDays);
  const duePos = linePosition(Math.min(livret.lineDue, cycleDays), cycleDays);
  const late = pb.status === "active" && livret.missedLines >= lateThreshold;
  return {
    passbookId: pb.id,
    passbookNumber: pb.number,
    passbookLabel: pb.label,
    dailyAmount: pb.dailyAmount,
    livret: {
      ...serializeLivret(livret),
      payable: payableWindow(livret),
      sheet: {
        index: current.index,
        label: current.label,
        attendu: current.attendu,
        encaisse: current.encaisse,
        avance: current.avance,
        reste: current.reste,
        coveredLines: current.coveredLines,
      },
      dueLineInSheet: duePos.lineInSheet,
    },
    balance,
    status: late ? "late" : pb.status,
    statusLabel:
      late ? "En retard"
      : pb.status === "active" ? "À jour"
      : pb.status === "closing" ? "Remise en cours"
      : pb.status === "completed" ? "Terminé"
      : "Clos",
  };
}
