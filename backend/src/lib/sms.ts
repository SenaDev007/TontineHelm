// TontiHelm — modèles de messages SMS (cahier des charges §13.5, sans accents, ≤ 160 caractères).
import { formatNumber } from "./domain";

/** Journées couvertes, compactes : « jour 17/31 » ou « jours 16-18/31 » ou « jours 3,7-9/31 ». */
function formatDays(days: number[], cycleDays: number): string {
  const uniq = [...new Set(days)].filter((d) => d >= 1).sort((a, b) => a - b);
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return `jour ${uniq[0]}/${cycleDays}`;
  const parts: string[] = [];
  let s = uniq[0];
  let p = uniq[0];
  for (let i = 1; i <= uniq.length; i++) {
    const v = uniq[i];
    if (v === p + 1) {
      p = v;
      continue;
    }
    parts.push(s === p ? `${s}` : `${s}-${p}`);
    s = v;
    p = v;
  }
  return `jours ${parts.join(",")}/${cycleDays}`;
}

export function receiptSms(params: {
  structure: string; amount: number; date: Date; passbookNumber: string;
  days: number[]; cycleDays: number; balance: number;
}): string {
  const d = params.date.toLocaleDateString("fr-FR");
  const jours = formatDays(params.days, params.cycleDays);
  return `${params.structure} : ${formatNumber(params.amount)} FCFA recus le ${d}. Carnet ${params.passbookNumber}, ${jours}. Solde cumule : ${formatNumber(params.balance)} FCFA.`;
}

export function lateReminderSms(params: {
  structure: string; passbookNumber: string; missedDays: number; agentName: string; link: string;
}): string {
  return `${params.structure} : ton carnet ${params.passbookNumber} a ${params.missedDays} jours sans versement. Passe voir ${params.agentName} ou paie ici : ${params.link}`;
}

export function cycleEndSms(params: {
  structure: string; total: number; place: string;
}): string {
  return `${params.structure} : ton cycle est termine. Total verse : ${formatNumber(params.total)} FCFA. Presente-toi a ${params.place} avec ta piece d'identite.`;
}
