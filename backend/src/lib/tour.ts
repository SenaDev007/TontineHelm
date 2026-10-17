// TontiHelm — sérialisation de tournée (phase 1) : fenêtre encaissable et arrêt
// de tournée du livret annuel. Extraits À L'IDENTIQUE de routes/agent.ts pour
// être partagés entre /api/agent/* (web, inchangé) et /v1/sync/* (mobile) —
// même code, mêmes formes de réponse, zéro divergence de calcul.
import { passbookBalance } from "./domain";
import { LIVRET_DAYS, buildLivret, linePosition, serializeLivret } from "./livret";

/** Fenêtre de lignes encaissables envoyée à l'écran d'encaissement (dues + avance). */
export function payableWindow(livret: ReturnType<typeof buildLivret>, count = 40) {
  const out: { line: number; sheet: number; lineInSheet: number; company: boolean; label: string }[] = [];
  // Livret entièrement réglé : aucune ligne à proposer.
  if (livret.lineDue > LIVRET_DAYS) return out;
  const start = Math.min(livret.lineDue, LIVRET_DAYS);
  for (let line = start; line < start + count && line <= LIVRET_DAYS; line += 1) {
    const pos = linePosition(line);
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

/** Sérialisation « arrêt de tournée » d'un carnet (livret annuel). */
export function livretStop(
  pb: { id: string; number: string; label: string | null; dailyAmount: number; startsOn: Date; status: string },
  collections: { amount: number }[],
  lateThreshold: number
) {
  const balance = passbookBalance(collections);
  const livret = buildLivret(pb, balance);
  const current = livret.sheets[livret.currentSheet - 1];
  const duePos = linePosition(Math.min(livret.lineDue, LIVRET_DAYS));
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
