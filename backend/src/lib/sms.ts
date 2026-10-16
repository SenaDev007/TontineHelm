// TontiHelm — modèles de messages SMS (cahier des charges §13.5, sans accents, ≤ 160 caractères).
import { formatNumber } from "./domain";

export function receiptSms(params: {
  structure: string; amount: number; date: Date; passbookNumber: string;
  dayIndex: number; cycleDays: number; balance: number;
}): string {
  const d = params.date.toLocaleDateString("fr-FR");
  return `${params.structure} : ${formatNumber(params.amount)} FCFA recus le ${d}. Carnet ${params.passbookNumber}, jour ${params.dayIndex}/${params.cycleDays}. Solde cumule : ${formatNumber(params.balance)} FCFA.`;
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
