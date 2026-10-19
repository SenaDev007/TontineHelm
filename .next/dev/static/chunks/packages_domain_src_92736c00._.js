(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/packages/domain/src/domain.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// TontiHelm — paquet domain : règles métier pures (cahier des charges §14.6)
// Aucune dépendance externe. Tous les montants sont des entiers (FCFA).
/** Format des montants : une seule fonction pour toute l'application. */ __turbopack_context__.s([
    "buildDayLedger",
    ()=>buildDayLedger,
    "closingGap",
    ()=>closingGap,
    "currentDayIndex",
    ()=>currentDayIndex,
    "cycleCommission",
    ()=>cycleCommission,
    "dayIndexOf",
    ()=>dayIndexOf,
    "effectiveDay",
    ()=>effectiveDay,
    "elapsedDays",
    ()=>elapsedDays,
    "formatFCFA",
    ()=>formatFCFA,
    "formatNumber",
    ()=>formatNumber,
    "isLate",
    ()=>isLate,
    "maxCollectionAmount",
    ()=>maxCollectionAmount,
    "missedDays",
    ()=>missedDays,
    "paidDays",
    ()=>paidDays,
    "passbookBalance",
    ()=>passbookBalance
]);
const formatFCFA = (n)=>new Intl.NumberFormat("fr-FR").format(n) + "\u00A0FCFA";
const formatNumber = (n)=>new Intl.NumberFormat("fr-FR").format(n);
function passbookBalance(collections) {
    return collections.reduce((sum, c)=>sum + c.amount, 0);
}
function paidDays(balance, dailyAmount) {
    if (dailyAmount <= 0) return 0;
    return Math.max(0, Math.floor(balance / dailyAmount));
}
function elapsedDays(passbook, today = new Date()) {
    const start = new Date(passbook.startsOn);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1;
    return Math.min(Math.max(diff, 0), passbook.cycleDays);
}
function missedDays(passbook, balance, today = new Date()) {
    return Math.max(0, elapsedDays(passbook, today) - paidDays(balance, passbook.dailyAmount));
}
function isLate(passbook, balance, threshold = 3, today = new Date()) {
    return missedDays(passbook, balance, today) >= threshold;
}
function cycleCommission(dailyAmount, cycleDays, commissionDays = 1) {
    return commissionDays * dailyAmount;
}
function currentDayIndex(passbook, today = new Date()) {
    return elapsedDays(passbook, today);
}
function closingGap(declaredCash, expectedCash) {
    return declaredCash - expectedCash;
}
function maxCollectionAmount(passbook, balance, advanceAllowed = false) {
    const cycleTotal = passbook.dailyAmount * passbook.cycleDays;
    if (advanceAllowed) return cycleTotal + passbook.dailyAmount; // un jour d'avance au maximum
    return Math.max(0, cycleTotal - balance);
}
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Minuit UTC de la journée calendaire d'une date. */ function utcDay(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function buildDayLedger(passbook, entries) {
    const n = passbook.cycleDays;
    if (n <= 0) return [];
    const startMs = utcDay(passbook.startsOn);
    const nets = new Array(n).fill(0);
    const idxOf = (d)=>Math.round((utcDay(d) - startMs) / MS_PER_DAY);
    const inCycle = (i)=>Number.isFinite(i) && i >= 0 && i < n;
    // 1. Encaissements : journée couverte explicite, sinon date d'encaissement.
    const deferred = [];
    for (const e of entries){
        if (e.amount <= 0) continue;
        const i = e.coversOn ? idxOf(e.coversOn) : idxOf(e.collectedAt);
        if (inCycle(i)) nets[i] += e.amount;
        else deferred.push(e.amount);
    }
    // 2. Annulations : même journée que l'écriture d'origine.
    const byId = new Map(entries.map((e)=>[
            e.id,
            e
        ]));
    const orphanNegatives = [];
    for (const e of entries){
        if (e.amount >= 0) continue;
        let i = Number.NaN;
        if (e.reversesId) {
            const orig = byId.get(e.reversesId);
            if (orig) i = orig.coversOn ? idxOf(orig.coversOn) : idxOf(orig.collectedAt);
        }
        if (inCycle(i)) nets[i] += e.amount;
        else orphanNegatives.push(e.amount);
    }
    // 3. Annulations non localisables : retirées depuis la dernière journée dotée.
    for (const amt of orphanNegatives){
        let rest = -amt;
        for(let j = n - 1; j >= 0 && rest > 0; j--){
            const take = Math.min(Math.max(nets[j], 0), rest);
            nets[j] -= take;
            rest -= take;
        }
    }
    // 4. Montants hors cycle : premières journées libres, puis la dernière.
    for (const amt of deferred){
        let rest = amt;
        for(let j = 0; j < n && rest > 0; j++){
            const put = Math.min(Math.max(0, passbook.dailyAmount - nets[j]), rest);
            nets[j] += put;
            rest -= put;
        }
        if (rest > 0) nets[n - 1] += rest;
    }
    // 5. Report de l'excédent vers l'avant : une journée marquée = une mise.
    let carry = 0;
    for(let i = 0; i < n; i++){
        const v = nets[i] + carry;
        if (v > passbook.dailyAmount) {
            nets[i] = passbook.dailyAmount;
            carry = v - passbook.dailyAmount;
        } else {
            nets[i] = v;
            carry = 0;
        }
    }
    if (carry > 0) nets[n - 1] += carry;
    return nets.map((net, i)=>({
            date: new Date(startMs + i * MS_PER_DAY),
            net
        }));
}
function effectiveDay(coversOn, collectedAt) {
    return coversOn ? new Date(utcDay(coversOn)) : new Date(utcDay(collectedAt));
}
function dayIndexOf(passbook, day) {
    const i = Math.round((utcDay(day) - utcDay(passbook.startsOn)) / MS_PER_DAY);
    return inCycleBounds(i, passbook.cycleDays) ? i : -1;
}
function inCycleBounds(i, cycleDays) {
    return Number.isFinite(i) && i >= 0 && i < cycleDays;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/packages/domain/src/livret.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CLIENT_LINES_PER_SHEET",
    ()=>CLIENT_LINES_PER_SHEET,
    "LIVRET_DAYS",
    ()=>LIVRET_DAYS,
    "LIVRET_MONTHS",
    ()=>LIVRET_MONTHS,
    "MIN_CYCLE_DAYS",
    ()=>MIN_CYCLE_DAYS,
    "SHEET_DAYS",
    ()=>SHEET_DAYS,
    "addMonths",
    ()=>addMonths,
    "advancePreview",
    ()=>advancePreview,
    "buildLivret",
    ()=>buildLivret,
    "clampCycleDays",
    ()=>clampCycleDays,
    "daysInMonth",
    ()=>daysInMonth,
    "effectiveStartDay",
    ()=>effectiveStartDay,
    "firstPayableLine",
    ()=>firstPayableLine,
    "lineLabel",
    ()=>lineLabel,
    "linePosition",
    ()=>linePosition,
    "livretStart",
    ()=>livretStart,
    "livretSummary",
    ()=>livretSummary,
    "livretTotal",
    ()=>livretTotal,
    "monthKey",
    ()=>monthKey,
    "monthLabel",
    ()=>monthLabel,
    "monthStart",
    ()=>monthStart,
    "monthsBetween",
    ()=>monthsBetween,
    "serializeLivret",
    ()=>serializeLivret,
    "sheetLastLine",
    ()=>sheetLastLine,
    "sheetLength",
    ()=>sheetLength,
    "sheetsForCycleDays",
    ()=>sheetsForCycleDays
]);
// TontiHelm — livret annuel : le moteur des carnets (2026-10).
// Un carnet = un livret d'UNE personne : des feuilles mensuelles (une par mois,
// en commençant par le mois en cours à la création) + une feuille finale de
// récapitulatif. Chaque feuille porte 31 lignes ; la DERNIÈRE ligne de chaque
// feuille est la mise de l'entreprise (marquée, jamais inscrite) : le client
// verse ses mises, les précédentes créditent son livret, la dernière revient à
// la structure.
//
// Durée de cycle PARAMÉTRABLE (décision n° 5 du dirigeant, PARITE.md §8.14) :
// `cycleDays` fixé à la création, bornes 1..372, défaut 372 = le livret annuel
// historique (12 feuilles). Une durée plus courte produit moins de feuilles —
// la DERNIÈRE feuille peut être PARTIELLE (p. ex. 45 jours = 31 + 14 lignes) ;
// sa dernière ligne reste la mise entreprise. Le comportement à 372 est
// strictement identique à celui du moteur historique (tests de non-régression).
//
// Les écritures remplissent les lignes SÉQUENTIELLEMENT (ligne 1, 2, 3… puis la
// feuille suivante) — exactement comme l'agent marque le carnet papier : chaque
// encaissement couvre la prochaine ligne non couverte ; payer davantage avance
// le marquage (avance), être en retard laisse la ligne due non couverte
// (rattrapage). Le montant au-delà des mises entières constitue une ligne
// partielle.
//
// ⚠ Règle d'équité (2026-10-17) : personne n'est en retard pour des jours
// ANTERIEURS à son arrivée. Le livret démarre au mois de création, mais si le
// cotisant arrive en cours de mois (créé le 17 alors que le mois a commencé le
// 1er), les lignes qui précèdent son jour d'arrivée sont EXCUSEES : non dues,
// hors attendu, hors comptage du retard. La 1re ligne encaissable est celle de
// son jour d'arrivée.
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$domain$2f$src$2f$domain$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/domain/src/domain.ts [app-client] (ecmascript)");
;
const LIVRET_MONTHS = 12;
const SHEET_DAYS = 31;
const LIVRET_DAYS = LIVRET_MONTHS * SHEET_DAYS; // 372 lignes (défaut)
const MIN_CYCLE_DAYS = 1; // bornes §8.14 : durée de cycle 1..372
const CLIENT_LINES_PER_SHEET = SHEET_DAYS - 1; // lignes 1..30 créditent le client
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function clampCycleDays(cycleDays) {
    const n = typeof cycleDays === "number" && Number.isFinite(cycleDays) ? Math.floor(cycleDays) : LIVRET_DAYS;
    return Math.min(Math.max(n, MIN_CYCLE_DAYS), LIVRET_DAYS);
}
function sheetsForCycleDays(cycleDays) {
    const total = clampCycleDays(cycleDays);
    return Math.ceil(total / SHEET_DAYS);
}
function sheetLength(sheetIdx0, cycleDays) {
    const total = clampCycleDays(cycleDays);
    return Math.max(0, Math.min(SHEET_DAYS, total - sheetIdx0 * SHEET_DAYS));
}
function sheetLastLine(sheetIdx0, cycleDays) {
    return sheetIdx0 * SHEET_DAYS + sheetLength(sheetIdx0, cycleDays);
}
function monthStart(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function livretStart(startsOn) {
    return monthStart(startsOn);
}
function addMonths(start, n) {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, 1));
}
function monthKey(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthsBetween(a, b) {
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}
function daysInMonth(year, monthIdx) {
    return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}
const MONTHS_FR = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
];
const MONTHS_FR_SHORT = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc."
];
function monthLabel(year, monthIdx, short = false) {
    const name = short ? MONTHS_FR_SHORT[monthIdx] : MONTHS_FR[monthIdx];
    return `${name} ${year}`;
}
function effectiveStartDay(passbook) {
    const month = monthStart(passbook.startsOn);
    if (!passbook.createdAt) return month;
    const created = utcDay(passbook.createdAt);
    const first = utcDay(month);
    return created > first ? new Date(created) : month;
}
function firstPayableLine(passbook) {
    const totalDays = clampCycleDays(passbook.cycleDays);
    const sheetCount = sheetsForCycleDays(totalDays);
    const start = livretStart(passbook.startsOn);
    const eff = effectiveStartDay(passbook);
    const effMonth = Math.min(Math.max(monthsBetween(start, monthStart(eff)), 0), sheetCount);
    const day = Math.min(Math.max(eff.getUTCDate(), 1), SHEET_DAYS);
    return Math.min(effMonth * SHEET_DAYS + day, totalDays);
}
function buildLivret(passbook, balance, today = new Date()) {
    const mise = Math.max(1, passbook.dailyAmount);
    const start = livretStart(passbook.startsOn);
    const todayMonth = monthStart(today);
    const cycleDays = clampCycleDays(passbook.cycleDays);
    const sheetCount = sheetsForCycleDays(cycleDays);
    // ── Arrivée du cotisant et lignes excusées (jamais en retard avant son arrivée) ──
    const firstLine = firstPayableLine(passbook);
    const excusedTotal = firstLine - 1;
    const effMonthIdx = Math.floor((firstLine - 1) / SHEET_DAYS); // feuille (0-based) de l'arrivée
    const effDayInSheet = (firstLine - 1) % SHEET_DAYS + 1; // 1..31 dans sa feuille
    const payableTotal = cycleDays - excusedTotal;
    const positiveBalance = Math.max(0, balance);
    const coveredLines = Math.min(payableTotal, Math.floor(positiveBalance / mise));
    const partial = coveredLines >= payableTotal ? 0 : positiveBalance - coveredLines * mise;
    const lastCoveredAbs = coveredLines > 0 ? firstLine + coveredLines - 1 : 0; // ligne absolue de la dernière mise
    // Feuille portant la ligne partielle (index 0..n-1) — aucune si partial = 0.
    const partialLineAbs = partial > 0 ? firstLine + coveredLines : 0;
    const sheets = [];
    let elapsedTotal = 0;
    for(let i = 0; i < sheetCount; i += 1){
        const sheetStart = addMonths(start, i);
        const year = sheetStart.getUTCFullYear();
        const month = sheetStart.getUTCMonth();
        const sheetFirstAbs = i * SHEET_DAYS + 1;
        const sheetLastAbs = sheetLastLine(i, cycleDays); // dernière ligne = mise entreprise
        // Lignes excusées de la feuille : toute la feuille avant le mois d'arrivée,
        // ou les lignes d'avant le jour d'arrivée dans la feuille d'arrivée.
        const excused = i < effMonthIdx ? sheetLastAbs - sheetFirstAbs + 1 : i === effMonthIdx ? effDayInSheet - 1 : 0;
        const payableCount = sheetLastAbs - sheetFirstAbs + 1 - excused;
        // Lignes couvertes de la feuille : intersection de la plage couverte
        // [firstLine, lastCoveredAbs] avec les lignes absolues de la feuille.
        const coveredInSheet = coveredLines > 0 ? Math.max(0, Math.min(sheetLastAbs, lastCoveredAbs) - Math.max(sheetFirstAbs, firstLine) + 1) : 0;
        const sheetPartial = partialLineAbs >= sheetFirstAbs && partialLineAbs <= sheetLastAbs ? partial : 0;
        const encaisse = coveredInSheet * mise + sheetPartial;
        const attendu = mise * payableCount;
        // Lignes échues de la feuille : par calendrier, MAIS en comptant depuis le
        // jour d'arrivée sur la feuille d'arrivée (jamais en retard avant l'arrivée).
        // Une feuille partielle du cycle court plafonne d'elle-même (payableCount).
        const rel = monthsBetween(sheetStart, todayMonth);
        const elapsedLines = rel > 0 ? payableCount : rel === 0 ? Math.min(payableCount, Math.max(0, today.getUTCDate() - excused)) : 0;
        elapsedTotal += elapsedLines;
        const avance = Math.max(0, encaisse - mise * elapsedLines);
        const clientLines = Math.max(0, payableCount - 1); // la dernière ligne de feuille = entreprise
        const partEntreprise = Math.min(mise, Math.max(0, encaisse - mise * clientLines));
        sheets.push({
            index: i + 1,
            key: monthKey(sheetStart),
            year,
            month,
            label: monthLabel(year, month),
            shortLabel: monthLabel(year, month, true),
            days: daysInMonth(year, month),
            attendu,
            encaisse,
            avance,
            reste: Math.max(0, attendu - encaisse),
            coveredLines: coveredInSheet,
            partial: sheetPartial,
            partClient: Math.min(encaisse, mise * clientLines),
            partEntreprise,
            complete: payableCount > 0 && encaisse >= attendu,
            elapsedLines,
            current: rel === 0,
            excused,
            payable: payableCount
        });
    }
    const missedLines = Math.max(0, elapsedTotal - coveredLines);
    const partEntrepriseTotal = sheets.reduce((s, sh)=>s + sh.partEntreprise, 0);
    const attenduTotal = mise * payableTotal;
    const avanceTotale = sheets.reduce((s, sh)=>s + sh.avance, 0);
    const recap = {
        mise,
        attendu: attenduTotal,
        encaisse: positiveBalance,
        reste: Math.max(0, attenduTotal - positiveBalance),
        avanceTotale,
        partEntreprise: partEntrepriseTotal,
        partClient: Math.max(0, positiveBalance - partEntrepriseTotal),
        sheetsComplete: sheets.filter((s)=>s.complete).length,
        sheetsStarted: sheets.filter((s)=>s.encaisse > 0).length,
        missedLines
    };
    // Feuille courante : celle du mois en cours, sinon la dernière feuille atteinte.
    let currentSheet = monthsBetween(start, todayMonth) + 1;
    if (currentSheet < 1) currentSheet = 1;
    if (currentSheet > sheetCount) currentSheet = sheetCount;
    // Feuille la plus avancée couverte par les versements (affichage « couvre jusqu'à »).
    let coveredThrough = null;
    if (coveredLines > 0) {
        const throughSheet = Math.min(Math.ceil(lastCoveredAbs / SHEET_DAYS), sheetCount);
        coveredThrough = {
            sheet: throughSheet,
            label: sheets[throughSheet - 1].label
        };
    }
    // ── Avances mensuelles calculées automatiquement ──
    // Le cotisant veut payer d'avance : on renseigne JUSQU'OÙ l'avance couvre (la
    // fin du mois en cours seul, ou plusieurs mois au-delà) et le système calcule
    // le montant (rattrapage inclus) puis ce qu'il restera à prendre.
    const advanceOptions = [];
    for(let m = effMonthIdx + 1; m <= sheetCount; m += 1){
        const targetAbs = sheetLastLine(m - 1, cycleDays); // dernière ligne (absolue) de la feuille m
        const amount = mise * (targetAbs - firstLine + 1) - positiveBalance;
        if (amount > 0) {
            advanceOptions.push({
                sheet: m,
                label: sheets[m - 1].shortLabel,
                amount,
                resteAfter: Math.max(0, attenduTotal - positiveBalance - amount)
            });
        }
    }
    return {
        months: sheetCount,
        cycleDays,
        startsOn: start.toISOString().slice(0, 10),
        effectiveStart: new Date(Date.UTC(addMonths(start, effMonthIdx).getUTCFullYear(), addMonths(start, effMonthIdx).getUTCMonth(), effDayInSheet)).toISOString().slice(0, 10),
        dailyAmount: mise,
        balance,
        coveredLines,
        payableLines: payableTotal,
        excusedLines: excusedTotal,
        lineDue: Math.min(firstLine + coveredLines, cycleDays + 1),
        missedLines,
        currentSheet,
        coveredThrough,
        advanceOptions,
        sheets,
        recap
    };
}
function linePosition(line, cycleDays = LIVRET_DAYS) {
    const total = clampCycleDays(cycleDays);
    const clamped = Math.min(Math.max(1, line), total);
    const sheet = Math.floor((clamped - 1) / SHEET_DAYS) + 1;
    const lineInSheet = (clamped - 1) % SHEET_DAYS + 1;
    // Mise entreprise : la DERNIÈRE ligne de SA feuille (31e en feuille pleine,
    // dernière ligne de la feuille partielle finale en cycle court).
    const company = lineInSheet === sheetLength(sheet - 1, total);
    return {
        sheet,
        lineInSheet,
        company
    };
}
function lineLabel(line, start, cycleDays = LIVRET_DAYS) {
    const { sheet, lineInSheet, company } = linePosition(line, cycleDays);
    const sheetStart = addMonths(livretStart(start), sheet - 1);
    const label = monthLabel(sheetStart.getUTCFullYear(), sheetStart.getUTCMonth(), true);
    return company ? `Mise entreprise · ${label}` : `Ligne ${lineInSheet} · ${label}`;
}
function livretTotal(dailyAmount, cycleDays = LIVRET_DAYS) {
    return dailyAmount * clampCycleDays(cycleDays);
}
function advancePreview(v, amount) {
    const mise = Math.max(1, v.dailyAmount);
    const cycleDays = clampCycleDays(v.cycleDays);
    const sheetCount = sheetsForCycleDays(cycleDays);
    const positiveBalance = Math.max(0, v.balance);
    const firstLine = Math.max(1, Math.min(v.lineDue - v.coveredLines, cycleDays));
    const resteBefore = Math.max(0, v.attendu - positiveBalance);
    const raw = Number.isFinite(amount) ? Math.floor(amount) : 0;
    const safe = Math.max(0, raw);
    const exceedsReste = safe > resteBefore;
    const coveredAfter = Math.min(v.payableLines, Math.floor((positiveBalance + safe) / mise));
    const lastCoveredAbs = coveredAfter > 0 ? firstLine + coveredAfter - 1 : 0;
    const sheet = lastCoveredAbs > 0 ? Math.min(sheetCount, Math.ceil(lastCoveredAbs / SHEET_DAYS)) : null;
    const label = sheet !== null ? v.sheets[sheet - 1]?.shortLabel ?? null : null;
    return {
        amount: raw,
        valid: raw > 0,
        exceedsReste,
        resteBefore,
        linesCoveredAfter: coveredAfter,
        coversThroughLine: lastCoveredAbs,
        coversThroughSheet: sheet,
        coversThroughLabel: label,
        coversFullSheet: sheet !== null && lastCoveredAbs === sheetLastLine(sheet - 1, cycleDays),
        partialAfter: Math.max(0, positiveBalance + Math.min(safe, resteBefore) - coveredAfter * mise),
        resteAfter: Math.max(0, resteBefore - safe)
    };
}
function livretSummary(livret) {
    return `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$domain$2f$src$2f$domain$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatFCFA"])(livret.recap.encaisse)} versés sur ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$domain$2f$src$2f$domain$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatFCFA"])(livret.recap.attendu)}`;
}
function utcDay(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function serializeLivret(livret) {
    return {
        months: livret.months,
        cycleDays: livret.cycleDays,
        startsOn: livret.startsOn,
        effectiveStart: livret.effectiveStart,
        dailyAmount: livret.dailyAmount,
        balance: livret.balance,
        coveredLines: livret.coveredLines,
        payableLines: livret.payableLines,
        excusedLines: livret.excusedLines,
        lineDue: livret.lineDue,
        missedLines: livret.missedLines,
        currentSheet: livret.currentSheet,
        coveredThrough: livret.coveredThrough,
        advanceOptions: livret.advanceOptions,
        sheets: livret.sheets.map((s)=>({
                ...s
            })),
        recap: {
            ...livret.recap
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=packages_domain_src_92736c00._.js.map