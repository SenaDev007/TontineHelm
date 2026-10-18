// TontiHelm — génération Excel (xlsx) des rapports cotisants / encaissements (2026-10).
// Fichier généré CÔTÉ SERVEUR avec ExcelJS : titre de structure, bandeau de marque,
// en-têtes de tableau stylés (bande bleue + texte blanc), sections par quartier
// fusionnées, identités de cotisants fusionnées verticalement pour leurs carnets
// multiples, montants en format monétaire, totaux — plus en-tête/pied de page
// d'impression structurés (structure, date de génération, pagination) et mise en
// page ajustée à la largeur (paysage A4).
import ExcelJS from "exceljs";
import {
  AuditReport,
  CollectionsReport,
  ContributorsReport,
  formatDayShort,
  formatDateTimeLong,
  formatFcfa,
  formatNumberFr,
  formatTime,
} from "./report";

const C = {
  blue: "FF003887",
  blueSoft: "FFE8F1FD",
  yellow: "FFFFB800",
  ink: "FF1E293B",
  subtle: "FF64748B",
  line: "FFD9E2EC",
  zebra: "FFF8FAFC",
  white: "FFFFFFFF",
  red: "FFB3261E",
  teal: "FF00806B",
};

const FCFA_FMT = '#,##0" FCFA";[Red]-#,##0" FCFA"';

function thin(color = C.line): ExcelJS.Borders {
  const side = { style: "thin" as const, color: { argb: color } };
  // diagonal sans diagonalUp/Down : aucune ligne diagonale n'est tracée (exigé par le typage).
  return { top: side, left: side, bottom: side, right: side, diagonal: side };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Échappe les « & » dans les codes d'en-tête/pied de page Excel. */
function hf(s: string): string {
  return s.replace(/&/g, "&&");
}

function applyPrintSetup(ws: ExcelJS.Worksheet, title: string, structure: string, generated: string) {
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.65, bottom: 0.65, header: 0.3, footer: 0.3 },
  };
  const header = `&L&"Calibri,Bold"&11TontiHelm&C&"Calibri,Bold"&12${hf(title)}&R&"Calibri,Italic"&8Généré le ${hf(generated)}`;
  const footer = `&L&"Calibri"&9${hf(structure)}&C&"Calibri"&9TontiHelm — document généré automatiquement&R&"Calibri"&9Page &P / &N`;
  ws.headerFooter = { oddHeader: header, oddFooter: footer, evenHeader: header, evenFooter: footer };
}

/** Bloc-titre commun : structure, intitulé du rapport, méta à droite, liseré jaune. */
function titleBlock(
  ws: ExcelJS.Worksheet,
  lastCol: number,
  structure: string,
  subtitle: string,
  metaRight: string[],
  metaLeft: string
) {
  const rightCol = Math.max(1, lastCol - 3);
  const row1 = ws.getRow(1);
  const nameCell = row1.getCell(1);
  nameCell.value = structure;
  nameCell.font = { name: "Calibri", size: 15, bold: true, color: { argb: C.blue } };
  ws.mergeCells(1, rightCol, 1, lastCol);
  const gen = row1.getCell(rightCol);
  gen.value = metaRight[0];
  gen.font = { name: "Calibri", size: 9, color: { argb: C.subtle } };
  gen.alignment = { horizontal: "right", vertical: "bottom" };
  row1.height = 22;

  const row2 = ws.getRow(2);
  const sub = row2.getCell(1);
  sub.value = subtitle;
  sub.font = { name: "Calibri", size: 11, color: { argb: C.ink } };
  ws.mergeCells(2, rightCol, 2, lastCol);
  const counts = row2.getCell(rightCol);
  counts.value = metaRight[1] ?? metaLeft;
  counts.font = { name: "Calibri", size: 9, color: { argb: C.subtle } };
  counts.alignment = { horizontal: "right", vertical: "top" };
  row2.height = 16;

  // Liseré de marque jaune sur toute la largeur.
  const row3 = ws.getRow(3);
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = row3.getCell(col);
    cell.fill = fill(C.yellow);
    cell.border = thin(C.yellow);
  }
  row3.height = 4;
}

/* ── Rapport des cotisants : sections par quartier, carnets sous chaque cotisant ── */

export async function contributorsXlsx(report: ContributorsReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TontiHelm";
  wb.created = report.generatedAt;
  const ws = wb.addWorksheet("Cotisants", {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  const HEADERS = [
    "Nom complet", "Téléphone", "N° carnet", "Surnom", "Mise / jour",
    "Mises versées", "Solde cumulé", "Carnet créé le", "Compte créé le", "Statut",
  ];
  const WIDTHS = [30, 15, 10, 17, 13, 13, 15, 14, 14, 17];
  ws.columns = HEADERS.map((h, i) => ({ header: "", key: `c${i}`, width: WIDTHS[i] }));
  const LAST = HEADERS.length; // 10 colonnes (A..J)

  titleBlock(
    ws,
    LAST,
    report.structure.name,
    "Liste des cotisants — groupés par quartier",
    [
      `Généré le ${formatDateTimeLong(report.generatedAt)}`,
      `${formatNumberFr(report.totals.cotisants)} cotisants · ${formatNumberFr(report.totals.carnets)} carnets · ${report.totals.quartiers} quartiers`,
    ],
    ""
  );

  // Ligne 4 : respiration ; ligne 5 : en-tête du tableau.
  ws.getRow(4).height = 6;
  const headerRow = ws.getRow(5);
  headerRow.height = 22;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.blue);
    cell.border = thin(C.blue);
    cell.alignment = { horizontal: i === 0 || i === 1 || i === 3 || i === 9 ? "left" : "right", vertical: "middle" };
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: LAST } };

  let r = 6;
  for (const group of report.groups) {
    // Section quartier : ligne fusionnée sur toute la largeur.
    const sectionRow = ws.getRow(r);
    ws.mergeCells(r, 1, r, LAST);
    const sc = sectionRow.getCell(1);
    sc.value =
      `QUARTIER · ${group.neighborhood.toUpperCase()} — ${group.cotisants} cotisant${group.cotisants > 1 ? "s" : ""} · ` +
      `${formatNumberFr(group.carnets)} carnet${group.carnets > 1 ? "s" : ""} · ${formatNumberFr(group.mises)} mises versées`;
    sc.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.blue } };
    sc.fill = fill(C.blueSoft);
    sc.alignment = { horizontal: "left", vertical: "middle" };
    for (let col = 1; col <= LAST; col += 1) sectionRow.getCell(col).border = thin(C.blueSoft);
    sectionRow.height = 18;
    r += 1;

    for (const entry of group.entries) {
      const blockRows = Math.max(1, entry.carnets.length);
      const startRow = r;
      for (let k = 0; k < blockRows; k += 1) {
        const row = ws.getRow(r);
        row.height = 16;
        const carnet = entry.carnets[k] ?? null;
        // Colonnes carnet : C..H et J (la 2e ligne et suivantes sont légèrement
        // teintées — les carnets apparaissent « sous » le cotisant).
        const sub = k > 0;
        const numberCell = row.getCell(3);
        numberCell.value = carnet?.number ?? (k === 0 ? "—" : "");
        numberCell.alignment = { horizontal: "center", vertical: "middle" };
        const labelCell = row.getCell(4);
        labelCell.value = carnet?.label ?? "";
        const miseCell = row.getCell(5);
        miseCell.value = carnet?.dailyAmount ?? null;
        miseCell.numFmt = FCFA_FMT;
        miseCell.alignment = { horizontal: "right", vertical: "middle" };
        const misesCell = row.getCell(6);
        misesCell.value = carnet?.coveredLines ?? null;
        misesCell.alignment = { horizontal: "right", vertical: "middle" };
        const soldeCell = row.getCell(7);
        soldeCell.value = carnet?.balance ?? null;
        soldeCell.numFmt = FCFA_FMT;
        soldeCell.alignment = { horizontal: "right", vertical: "middle" };
        const carnetCreated = row.getCell(8);
        carnetCreated.value = carnet ? formatDayShort(carnet.createdAt) : "";
        carnetCreated.alignment = { horizontal: "center", vertical: "middle" };
        const statusCell = row.getCell(10);
        statusCell.value = carnet?.statusLabel ?? (k === 0 ? "Aucun carnet" : "");
        statusCell.alignment = { horizontal: "left", vertical: "middle" };
        statusCell.font = {
          name: "Calibri",
          size: 9,
          color: { argb: carnet?.statusLabel === "En retard" ? C.red : carnet?.statusLabel === "À jour" ? C.teal : C.subtle },
        };
        // Bordures + teinte des sous-lignes (carnets « sous » le cotisant).
        for (let col = 1; col <= LAST; col += 1) {
          const cell = row.getCell(col);
          cell.border = thin();
          if (sub && col >= 3 && col !== 9) cell.fill = fill(C.zebra);
        }
        // Style texte par défaut des colonnes carnet.
        numberCell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
        labelCell.font = { name: "Calibri", size: 9.5, color: { argb: C.subtle } };
        miseCell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
        misesCell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
        soldeCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.ink } };
        carnetCreated.font = { name: "Calibri", size: 9.5, color: { argb: C.subtle } };
        r += 1;
      }
      // Identité du cotisant : fusion verticale A / B / I sur le bloc.
      if (blockRows > 1) {
        ws.mergeCells(startRow, 1, r - 1, 1);
        ws.mergeCells(startRow, 2, r - 1, 2);
        ws.mergeCells(startRow, 9, r - 1, 9);
      }
      const nameCell = ws.getRow(startRow).getCell(1);
      nameCell.value = entry.fullName;
      nameCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.ink } };
      nameCell.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
      const phoneCell = ws.getRow(startRow).getCell(2);
      phoneCell.value = entry.phone ?? "—";
      phoneCell.font = { name: "Calibri", size: 9, color: { argb: C.subtle } };
      phoneCell.alignment = { horizontal: "left", vertical: "middle" };
      const accountCell = ws.getRow(startRow).getCell(9);
      accountCell.value = formatDayShort(entry.createdAt);
      accountCell.font = { name: "Calibri", size: 9, color: { argb: C.subtle } };
      accountCell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }

  // Totaux généraux.
  const totalRow = ws.getRow(r);
  ws.mergeCells(r, 1, r, 5);
  const tLabel = totalRow.getCell(1);
  tLabel.value =
    `TOTAL GÉNÉRAL — ${formatNumberFr(report.totals.cotisants)} cotisants · ${formatNumberFr(report.totals.carnets)} carnets`;
  tLabel.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.blue } };
  tLabel.alignment = { horizontal: "left", vertical: "middle" };
  const tMises = totalRow.getCell(6);
  tMises.value = report.totals.mises;
  tMises.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.ink } };
  tMises.alignment = { horizontal: "right", vertical: "middle" };
  const tSolde = totalRow.getCell(7);
  tSolde.value = report.totals.solde;
  tSolde.numFmt = FCFA_FMT;
  tSolde.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.ink } };
  tSolde.alignment = { horizontal: "right", vertical: "middle" };
  for (let col = 1; col <= LAST; col += 1) {
    const cell = totalRow.getCell(col);
    cell.fill = fill(C.blueSoft);
    cell.border = thin(C.blueSoft);
  }
  totalRow.height = 19;

  applyPrintSetup(
    ws,
    "Liste des cotisants par quartier",
    report.structure.name,
    formatDayShort(report.generatedAt)
  );

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as unknown as ArrayBuffer);
}

/* ── Rapport des encaissements : historique sur une période ── */

export async function collectionsXlsx(report: CollectionsReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TontiHelm";
  wb.created = report.generatedAt;
  const ws = wb.addWorksheet("Encaissements", { views: [{ state: "frozen", ySplit: 6 }] });

  const HEADERS = [
    "Date", "Heure", "Cotisant", "Carnet", "Agent", "Quartier", "Ligne", "Mode", "Montant", "Type",
  ];
  const WIDTHS = [12, 9, 26, 10, 18, 16, 8, 14, 16, 13];
  ws.columns = HEADERS.map((h, i) => ({ header: "", key: `c${i}`, width: WIDTHS[i] }));
  const LAST = HEADERS.length; // 10 colonnes (A..J)

  titleBlock(
    ws,
    LAST,
    report.structure.name,
    "Historique des encaissements",
    [
      `Généré le ${formatDateTimeLong(report.generatedAt)}`,
      `Période : ${report.period.label}`,
    ],
    ""
  );

  // Ligne 4 : résumé de la période ; ligne 5 : liseré jaune ; ligne 6 : en-têtes.
  const summaryRow = ws.getRow(4);
  ws.mergeCells(4, 1, 4, LAST);
  const sum = summaryRow.getCell(1);
  sum.value =
    `${formatNumberFr(report.totals.versements)} versements · ${report.methodLabel} · ` +
    `Espèces : ${formatFcfa(report.totals.cash)} · Mobile money : ${formatFcfa(report.totals.mobile)} · ` +
    `Net encaissé : ${formatFcfa(report.totals.net)}` +
    (report.totals.annulations > 0 ? ` · ${report.totals.annulations} annulation${report.totals.annulations > 1 ? "s" : ""}` : "");
  sum.font = { name: "Calibri", size: 9, color: { argb: C.ink } };
  sum.alignment = { horizontal: "left", vertical: "middle" };
  summaryRow.height = 14;

  const stripRow = ws.getRow(5);
  for (let col = 1; col <= LAST; col += 1) {
    const cell = stripRow.getCell(col);
    cell.fill = fill(C.yellow);
    cell.border = thin(C.yellow);
  }
  stripRow.height = 4;

  // Ligne 6 : en-tête du tableau.
  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.blue);
    cell.border = thin(C.blue);
    cell.alignment = { horizontal: [0, 2, 3, 4, 5, 7, 9].includes(i) ? "left" : "right", vertical: "middle" };
  });
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: LAST } };

  let r = 7;
  report.rows.forEach((row, idx) => {
    const x = ws.getRow(r);
    x.height = 15;
    const values: (string | number | null)[] = [
      formatDayShort(row.at),
      formatTime(row.at),
      row.contributor,
      row.passbook,
      row.agent,
      row.neighborhood,
      row.line,
      row.method === "cash" ? "Espèces" : "Mobile money",
      row.amount,
      row.reversal ? "Annulation" : "Versement",
    ];
    values.forEach((v, i) => {
      const cell = x.getCell(i + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 9.5, color: { argb: row.reversal ? C.red : C.ink } };
      cell.border = thin();
      if (i === 6 || i === 8) cell.alignment = { horizontal: "right", vertical: "middle" };
      else if (i === 0 || i === 1 || i === 3) cell.alignment = { horizontal: "center", vertical: "middle" };
      else cell.alignment = { horizontal: "left", vertical: "middle" };
      if (idx % 2 === 1) cell.fill = fill(C.zebra);
    });
    x.getCell(9).numFmt = FCFA_FMT;
    if (row.reversal) {
      x.getCell(10).font = { name: "Calibri", size: 9, bold: true, color: { argb: C.red } };
    }
    r += 1;
  });

  if (report.rows.length === 0) {
    const empty = ws.getRow(r);
    ws.mergeCells(r, 1, r, LAST);
    empty.getCell(1).value = "Aucun encaissement sur cette période.";
    empty.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: C.subtle } };
    empty.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r += 1;
  }

  // Totaux de période.
  const totalRow = ws.getRow(r);
  ws.mergeCells(r, 1, r, 8);
  const tl = totalRow.getCell(1);
  tl.value = `TOTAL DE LA PÉRIODE — ${formatNumberFr(report.totals.versements)} versements${report.totals.annulations > 0 ? ` · ${report.totals.annulations} annulations` : ""}`;
  tl.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.blue } };
  tl.alignment = { horizontal: "left", vertical: "middle" };
  const tm = totalRow.getCell(9);
  tm.value = report.totals.net;
  tm.numFmt = FCFA_FMT;
  tm.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.ink } };
  tm.alignment = { horizontal: "right", vertical: "middle" };
  for (let col = 1; col <= LAST; col += 1) {
    const cell = totalRow.getCell(col);
    cell.fill = fill(C.blueSoft);
    cell.border = thin(C.blueSoft);
  }
  totalRow.height = 19;

  applyPrintSetup(
    ws,
    "Historique des encaissements",
    report.structure.name,
    formatDayShort(report.generatedAt)
  );

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as unknown as ArrayBuffer);
}

/* ── Journal d'audit (décision n° 10, PARITE.md §8.15) ── */

export async function auditXlsx(report: AuditReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TontiHelm";
  wb.created = report.generatedAt;
  const ws = wb.addWorksheet("Journal d'audit", { views: [{ state: "frozen", ySplit: 6 }] });

  const HEADERS = ["N°", "Date", "Heure", "Auteur", "Rôle", "Action", "Entité", "Détail (JSON)", "Hash"];
  const WIDTHS = [8, 12, 9, 22, 13, 22, 14, 60, 34];
  ws.columns = HEADERS.map((h, i) => ({ header: "", key: `c${i}`, width: WIDTHS[i] }));
  const LAST = HEADERS.length; // 9 colonnes (A..I)

  titleBlock(
    ws,
    LAST,
    report.structure.name,
    "Journal d'audit",
    [
      `Généré le ${formatDateTimeLong(report.generatedAt)}`,
      `Période : ${report.period.label}${report.actionFilter ? ` · action « ${report.actionFilter} »` : ""}`,
    ],
    ""
  );

  // Ligne 4 : résumé ; ligne 5 : liseré jaune ; ligne 6 : en-têtes.
  const summaryRow = ws.getRow(4);
  ws.mergeCells(4, 1, 4, LAST);
  const sum = summaryRow.getCell(1);
  sum.value =
    `${formatNumberFr(report.totals.rows)} lignes · ${report.totals.actions} type${report.totals.actions > 1 ? "s" : ""} d'action · ` +
    `chaîne d'audit ${report.chainOk ? "INTACTE" : "INTERROMPUE"}`;
  sum.font = { name: "Calibri", size: 9, color: { argb: report.chainOk ? C.ink : C.red } };
  sum.alignment = { horizontal: "left", vertical: "middle" };
  summaryRow.height = 14;

  const stripRow = ws.getRow(5);
  for (let col = 1; col <= LAST; col += 1) {
    const cell = stripRow.getCell(col);
    cell.fill = fill(C.yellow);
    cell.border = thin(C.yellow);
  }
  stripRow.height = 4;

  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.blue);
    cell.border = thin(C.blue);
    cell.alignment = { horizontal: i === 0 ? "right" : "left", vertical: "middle" };
  });
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: LAST } };

  let r = 7;
  report.rows.forEach((row, idx) => {
    const x = ws.getRow(r);
    x.height = 15;
    const values: (string | number | null)[] = [
      row.seq,
      formatDayShort(row.at),
      formatTime(row.at),
      row.actor,
      roleLabelFr(row.actorRole),
      row.action,
      row.entity,
      row.payload,
      row.hash,
    ];
    values.forEach((v, i) => {
      const cell = x.getCell(i + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 9.5, color: { argb: C.ink } };
      cell.border = thin();
      if (i === 0) cell.alignment = { horizontal: "right", vertical: "middle" };
      else if (i === 1 || i === 2) cell.alignment = { horizontal: "center", vertical: "middle" };
      else cell.alignment = { horizontal: "left", vertical: "middle" };
      if (idx % 2 === 1) cell.fill = fill(C.zebra);
    });
    x.getCell(8).font = { name: "Consolas", size: 8.5, color: { argb: C.subtle } };
    x.getCell(9).font = { name: "Consolas", size: 8.5, color: { argb: C.subtle } };
    r += 1;
  });

  if (report.rows.length === 0) {
    const empty = ws.getRow(r);
    ws.mergeCells(r, 1, r, LAST);
    empty.getCell(1).value = "Aucune entrée pour ces filtres.";
    empty.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: C.subtle } };
    empty.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r += 1;
  }

  // Totaux + état de la chaîne.
  const totalRow = ws.getRow(r);
  ws.mergeCells(r, 1, r, LAST - 1);
  const tl = totalRow.getCell(1);
  tl.value = `TOTAL DU JOURNAL — ${formatNumberFr(report.totals.rows)} lignes · chaîne d'audit ${report.chainOk ? "intacte" : "INTERROMPUE"}`;
  tl.font = { name: "Calibri", size: 10, bold: true, color: { argb: report.chainOk ? C.blue : C.red } };
  tl.alignment = { horizontal: "left", vertical: "middle" };
  totalRow.getCell(LAST).value = report.chainOk ? "Vérifiée" : "À inspecter";
  totalRow.getCell(LAST).font = { name: "Calibri", size: 10, bold: true, color: { argb: report.chainOk ? C.teal : C.red } };
  totalRow.getCell(LAST).alignment = { horizontal: "right", vertical: "middle" };
  for (let col = 1; col <= LAST; col += 1) {
    const cell = totalRow.getCell(col);
    cell.fill = fill(C.blueSoft);
    cell.border = thin(C.blueSoft);
  }
  totalRow.height = 19;

  applyPrintSetup(ws, "Journal d'audit", report.structure.name, formatDayShort(report.generatedAt));

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as unknown as ArrayBuffer);
}

function roleLabelFr(role: string): string {
  switch (role) {
    case "owner": return "propriétaire";
    case "manager": return "gérante";
    case "agent": return "agent";
    case "controller": return "contrôleur";
    case "admin": return "admin";
    default: return "système";
  }
}
