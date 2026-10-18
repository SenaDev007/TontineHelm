// TontiHelm mobile — écran Encaisser (phase 2) : correction du dirigeant —
// l'AVANCE n'est pas obligatoirement le total du mois : le cotisant peut verser
// une PARTIE. L'agent saisit le montant désiré (pavé numérique) ; les puces de
// feuille restent des raccourcis qui préremplissent le total. Même logique que
// le web : advancePreview() vient du paquet partagé @tontihelm/domain.
// Mode « Ligne à ligne » : due / rattrapage / lignes suivantes (avance), comme
// le web. HORS LIGNE (écarts n° 6/7) : chaque écriture tombe dans la file
// chiffrée (SQLCipher) — un UUID v7 par ligne couverte, ou l'écriture unique
// de l'avance — puis part SEULE : immédiatement en ligne, sinon à la cadence
// 2/4/8/16 s puis 5 min ; les rejets définitifs remontent ici et dans l'écran
// de reprise (Compte).
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View, Vibration } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { colors } from "@/theme/tokens";
import { useTour, todayOf } from "@/lib/tour-store";
import { useOutbox } from "@/lib/outbox-store";
import { RealtimePill, SyncPill } from "@/components/pills";
import { advancePreview, formatFCFA } from "@tontihelm/domain";

type Mode = "lines" | "advance";

/* Pavé numérique (§15.7) : cibles 48 dp minimum, aucun emoji. */
function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "eff"];
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {keys.map((k) => (
        <Pressable
          key={k}
          onPress={() => {
            if (k === "eff") onChange("");
            else if (value.length < 7) onChange(value + k);
          }}
          className="items-center justify-center rounded-xl border border-line bg-paper active:bg-[#EDF2F7]"
          style={{ width: "31.5%", minHeight: 52 }}
        >
          <Text className="font-heading text-lg text-ink">{k === "eff" ? "eff" : k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function StatusChip({ label }: { label: string }) {
  const danger = label === "En retard";
  return (
    <View
      className="rounded-full px-2.5 py-1"
      style={{ backgroundColor: danger ? "#FDECEA" : colors.primarySoft }}
    >
      <Text className="font-medium text-[11px]" style={{ color: danger ? colors.danger : colors.primaryDark }}>
        {label}
      </Text>
    </View>
  );
}

export default function CollectScreen() {
  const stops = useTour((s) => s.stops);
  const contributors = useTour((s) => s.contributors);
  const ready = useTour((s) => s.ready);
  const error = useTour((s) => s.error);
  const refreshing = useTour((s) => s.refreshing);
  const realtime = useTour((s) => s.realtime);
  const closing = useTour((s) => s.closing);
  const refresh = useTour((s) => s.refresh);

  const enqueue = useOutbox((s) => s.enqueue);
  const pending = useOutbox((s) => s.pending);
  const online = useOutbox((s) => s.online);
  const blocked = useOutbox((s) => s.blocked);
  const rejectedCount = useOutbox((s) => s.rejected.length);

  // Arrêt ciblé depuis la Tournée ou l'onglet Clients (« Encaisser sur ce carnet »).
  const params = useLocalSearchParams<{ passbook?: string }>();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("lines");
  const [lineSel, setLineSel] = useState<number[] | null>(null); // null = ligne due
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [advanceInput, setAdvanceInput] = useState<string | null>(null); // null = preset
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    if (params.passbook) openStop(String(params.passbook));
  }, [params.passbook]);

  const stop = stops.find((s) => s.passbookId === selectedId) ?? null;
  const contributor = stop ? contributors.find((c) => c.id === stop.contributorId) ?? null : null;

  const view = useMemo(() => {
    if (!stop) return null;
    const payable = stop.livret.payable ?? [];
    return { payable, due: payable[0] ?? null, rest: payable.slice(1), late: stop.livret.missedLines > 0 };
  }, [stop]);

  const effectiveSelected = useMemo(() => {
    if (!view) return [] as number[];
    if (lineSel !== null) return lineSel;
    return view.due ? [view.due.line] : [];
  }, [lineSel, view]);

  const suggestedTotal = effectiveSelected.length * (stop?.dailyAmount ?? 0);
  const amount = amountInput === null ? suggestedTotal : parseInt(amountInput || "0", 10) || 0;

  // Répartition ligne à ligne : 1 mise par ligne, la dernière partielle.
  const allocations = useMemo(() => {
    if (!view || !stop || mode !== "lines") return [] as { line: number; amount: number }[];
    let left = amount;
    const out: { line: number; amount: number }[] = [];
    for (const line of effectiveSelected) {
      const take = Math.min(stop.dailyAmount, left);
      if (take > 0) out.push({ line, amount: take });
      left -= take;
    }
    return out;
  }, [amount, effectiveSelected, view, stop, mode]);

  // ── Avance (totale ou PARTIELLE) — même fonction pure que le web ──
  const advanceOptions = stop?.livret.advanceOptions ?? [];
  const advanceDefault = advanceOptions[0] ?? null;
  const advanceValue =
    mode === "advance"
      ? advanceInput === null
        ? advanceDefault?.amount ?? 0
        : parseInt(advanceInput || "0", 10) || 0
      : 0;
  const activePreset = advanceOptions.find((o) => o.amount === advanceValue) ?? null;

  const preview = useMemo(() => {
    if (!stop || mode !== "advance") return null;
    return advancePreview(
      {
        dailyAmount: stop.dailyAmount,
        balance: stop.balance,
        coveredLines: stop.livret.coveredLines,
        payableLines: stop.livret.payableLines,
        lineDue: stop.livret.lineDue,
        attendu: stop.livret.recap.attendu,
        sheets: stop.livret.sheets,
        cycleDays: stop.livret.cycleDays,
      },
      advanceValue
    );
  }, [stop, mode, advanceValue]);

  const cycleTotal = stop?.livret.recap.attendu ?? 0;
  const overMax = mode === "lines" && stop !== null && amount > cycleTotal - stop.balance;
  const unallocated = mode === "lines" && amount > suggestedTotal;
  const canSubmit =
    stop !== null &&
    !saving &&
    !blocked &&
    closing?.status !== "validated" &&
    (mode === "advance"
      ? preview !== null && preview.valid && !preview.exceedsReste
      : allocations.length > 0 && amount > 0 && !overMax && !unallocated);

  const openStop = (id: string) => {
    setSelectedId(id);
    setMode("lines");
    setLineSel(null);
    setAmountInput(null);
    setAdvanceInput(null);
    setSavedCount(null);
  };

  const submit = async () => {
    if (!stop || !canSubmit) return;
    setSaving(true);
    try {
      // Un événement PAR LIGNE couverte, ou l'écriture unique de l'avance :
      // la file fabrique UUID v7, deviceId et horodatages (écarts n° 6/7).
      const inputs =
        mode === "advance" && preview
          ? [{ passbookId: stop.passbookId, amount: preview.amount, advance: true }]
          : allocations.map((a) => ({ passbookId: stop.passbookId, amount: a.amount, advance: false }));
      await enqueue(inputs);
      Vibration.vibrate(60); // confirmation tactile, comme le web
      setSavedCount(inputs.length);
      setLineSel(null);
      setAmountInput(null);
      setAdvanceInput(null);
    } finally {
      setSaving(false);
    }
  };

  // ── Liste des arrêts (aucun carnet sélectionné) ──
  if (!stop) {
    const collectable = stops
      .filter((s) => s.status === "active" || s.status === "late")
      .map((s) => ({
        stop: s,
        name: contributors.find((c) => c.id === s.contributorId)?.fullName ?? "Cotisant",
        neighborhood: contributors.find((c) => c.id === s.contributorId)?.neighborhood ?? "",
      }))
      .sort(
        (a, b) =>
          a.neighborhood.localeCompare(b.neighborhood, "fr") || a.name.localeCompare(b.name, "fr")
      );
    const done = collectable.filter(({ stop: s }) => todayOf(s));

    return (
      <ScrollView
        className="flex-1 bg-paper"
        contentContainerClassName="px-6 pb-10 pt-16"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View className="flex-row items-center justify-between">
          <Text className="font-title text-[28px] leading-[34px] text-ink">Encaisser</Text>
          <View className="flex-row items-center gap-2">
            <SyncPill compact />
            <RealtimePill state={realtime} />
          </View>
        </View>
        <Text className="mt-1 font-body text-base text-ink-muted">
          {ready
            ? collectable.length > 0
              ? `${collectable.length - done.length} client${collectable.length - done.length > 1 ? "s" : ""} à encaisser aujourd'hui.`
              : "Tous tes clients du jour sont encaissés."
            : "Chargement de la tournée…"}
        </Text>
        {/* Bandeaux d'état de la file — indicateur permanent (écart n° 7) */}
        {online === false ? (
          <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: colors.goldSoft }}>
            <Text className="font-body text-[13px] leading-[19px] text-warning">
              Hors ligne — les encaissements s'enregistrent sur le téléphone et partent seuls au retour du réseau.
            </Text>
          </View>
        ) : null}
        {blocked ? (
          <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
            <Text className="font-body text-[13px] leading-[19px] text-danger">
              Hors ligne depuis plus de 7 jours : reconnecte-toi et synchronise avant de continuer à encaisser.
            </Text>
          </View>
        ) : null}
        {rejectedCount > 0 ? (
          <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
            <Text className="font-body text-[13px] leading-[19px] text-danger">
              {rejectedCount} écriture{rejectedCount > 1 ? "s" : ""} refusée{rejectedCount > 1 ? "s" : ""} par le serveur —
              détails et mise de côté dans l'onglet Compte.
            </Text>
          </View>
        ) : null}
        {error ? (
          <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
            <Text className="font-body text-[14px] leading-[20px] text-danger">{error}</Text>
          </View>
        ) : null}
        {closing?.status === "validated" ? (
          <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: colors.goldSoft }}>
            <Text className="font-body text-[14px] leading-[20px] text-warning">
              Clôture validée : les encaissements du jour sont verrouillés.
            </Text>
          </View>
        ) : null}

        <View className="mt-4 gap-3">
          {collectable.map(({ stop: s, name, neighborhood }) => {
            const today = todayOf(s);
            return (
              <Pressable
                key={s.passbookId}
                onPress={() => openStop(s.passbookId)}
                className="rounded-2xl border border-line bg-paper p-4 active:bg-[#F0F5FC]"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="items-center justify-center rounded-xl"
                    style={{ backgroundColor: "#EDF2F7", width: 44, height: 44 }}
                  >
                    <Text className="font-heading text-[13px] text-ink">{s.passbookNumber}</Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="font-heading text-[15px] text-ink" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text className="mt-0.5 font-body text-[12px] text-ink-muted" numberOfLines={1}>
                      {neighborhood || "—"} · F{s.livret.currentSheet}/{s.livret.months ?? 12} · L{s.livret.dueLineInSheet} ·{" "}
                      {formatFCFA(s.dailyAmount)}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <StatusChip label={s.statusLabel} />
                    <Text className="font-medium text-[12px] text-ink">
                      {today ? `+ ${formatFCFA(today.amount)} aujourd'hui` : formatFCFA(s.balance)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          {ready && collectable.length === 0 ? (
            <View className="rounded-2xl border border-line p-6">
              <Text className="text-center font-body text-[14px] text-ink-muted">
                Aucun carnet actif dans ta tournée.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  // ── Encaissement d'un carnet ──
  const sheet = stop.livret.sheet;
  const previewLineInSheet =
    preview && preview.coversThroughLine > 0 ? ((preview.coversThroughLine - 1) % 31) + 1 : null;
  const advanceMonths = preview?.coversFullSheet ? (preview.coversThroughSheet ?? 0) - stop.livret.currentSheet : 0;

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="px-6 pb-10 pt-12"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {/* Retour + titre */}
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setSelectedId(null)}
          className="items-center justify-center rounded-xl border border-line"
          style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 12 }}
        >
          <Text className="font-heading text-[14px] text-primary">Retour</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <SyncPill compact />
          <RealtimePill state={realtime} />
        </View>
      </View>

      {/* En-tête du carnet */}
      <View className="mt-4 rounded-2xl border border-line p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text className="font-medium text-[11px] uppercase tracking-wide text-ink-muted">
              Carnet {stop.passbookNumber}
              {stop.passbookLabel ? ` · ${stop.passbookLabel}` : ""}
            </Text>
            <Text className="mt-0.5 font-heading text-[20px] text-ink" numberOfLines={1}>
              {contributor?.fullName ?? "Cotisant"}
            </Text>
            <Text className="mt-0.5 font-body text-[13px] text-ink-muted">
              Feuille {sheet.index}/{stop.livret.months ?? 12} ({sheet.label}) · ligne {stop.livret.dueLineInSheet}
            </Text>
          </View>
          <StatusChip label={stop.statusLabel} />
        </View>
        <View className="mt-3 flex-row gap-2.5">
          <View className="flex-1 rounded-xl border border-line bg-[#F4F7FB] px-3 py-2.5">
            <Text className="font-medium text-[10px] uppercase text-ink-muted">Solde cumulé</Text>
            <Text className="mt-0.5 font-medium text-[14px] text-ink">{formatFCFA(stop.balance)}</Text>
          </View>
          <View className="flex-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.goldSoft }}>
            <Text className="font-medium text-[10px] uppercase text-warning">Avance (feuille)</Text>
            <Text className="mt-0.5 font-medium text-[14px] text-warning">{formatFCFA(sheet.avance)}</Text>
          </View>
          <View className="flex-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.primarySoft }}>
            <Text className="font-medium text-[10px] uppercase text-primary-dark">Reste (feuille)</Text>
            <Text className="mt-0.5 font-medium text-[14px] text-primary-dark">{formatFCFA(sheet.reste)}</Text>
          </View>
        </View>
        <Text className="mt-2 font-body text-[12px] text-ink-muted">
          Lignes couvertes : {stop.livret.coveredLines}/{stop.livret.payableLines}
          {stop.livret.missedLines > 0 ? ` · ${stop.livret.missedLines} en retard` : ""}
        </Text>
      </View>

      {/* Mode d'encaissement */}
      <View className="mt-4 flex-row rounded-xl border border-line bg-[#F4F7FB] p-1.5" style={{ gap: 6 }}>
        <Pressable
          onPress={() => setMode("lines")}
          className="flex-1 items-center justify-center rounded-lg"
          style={{ minHeight: 44, backgroundColor: mode === "lines" ? "#FFFFFF" : "transparent" }}
        >
          <Text
            className="font-heading text-[14px]"
            style={{ color: mode === "lines" ? colors.ink : colors.inkMuted }}
          >
            Ligne à ligne
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("advance")}
          className="flex-1 items-center justify-center rounded-lg"
          style={{ minHeight: 44, backgroundColor: mode === "advance" ? "#FFFFFF" : "transparent" }}
        >
          <Text
            className="font-heading text-[14px]"
            style={{ color: mode === "advance" ? colors.ink : colors.inkMuted }}
          >
            Avance
          </Text>
        </Pressable>
      </View>

      {mode === "advance" ? (
        <View className="mt-4">
          <Text className="font-body text-[12px] leading-[18px] text-ink-muted">
            {contributor?.fullName ?? "Le cotisant"} décide de payer d'avance ? Saisis le montant qu'il désire
            verser — le total d'une feuille (raccourci) ou juste une PARTIE. Le système calcule jusqu'où
            l'avance couvre et ce qu'il restera à prendre.
          </Text>

          {advanceOptions.length === 0 ? (
            <View className="mt-3 rounded-xl border border-line bg-[#F4F7FB] p-4">
              <Text className="font-body text-[14px] text-ink-muted">
                Livret entièrement réglé : aucune avance possible.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 12 }}>
              {advanceOptions.map((o) => {
                const months = o.sheet - stop.livret.currentSheet;
                const isActive = activePreset?.sheet === o.sheet;
                return (
                  <Pressable
                    key={o.sheet}
                    onPress={() => setAdvanceInput(String(o.amount))}
                    className="items-center justify-center rounded-xl border"
                    style={{
                      minWidth: 92,
                      minHeight: 52,
                      backgroundColor: isActive ? colors.primary : "#FFFFFF",
                      borderColor: isActive ? colors.primary : colors.line,
                    }}
                  >
                    <Text
                      className="font-heading text-[12px]"
                      style={{ color: isActive ? "#FFFFFF" : colors.ink }}
                    >
                      {months === 0 ? "Ce mois" : `+${months} mois`}
                    </Text>
                    <Text
                      className="mt-1 font-medium text-[10px]"
                      style={{ color: isActive ? "rgba(255,255,255,0.8)" : colors.inkMuted }}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Montant : saisi par l'agent — une PARTIE suffit (décision du dirigeant) */}
          <Text className="mt-3 font-medium text-[11px] uppercase tracking-wide text-ink-muted">
            Montant que le cotisant veut payer
          </Text>
          <View
            className="mt-1 items-center justify-center rounded-xl border-2"
            style={{
              minHeight: 64,
              backgroundColor: preview?.exceedsReste ? "#FDECEA" : colors.goldSoft,
              borderColor: preview?.exceedsReste ? colors.danger : "#F0D48A",
            }}
          >
            <Text
              className="font-heading text-[34px]"
              style={{ color: preview?.exceedsReste ? colors.danger : colors.warning }}
            >
              {formatFCFA(advanceValue)}
            </Text>
          </View>

          {/* Aperçu : jusqu'où l'avance couvre et reste à prendre */}
          {preview && preview.valid && !preview.exceedsReste ? (
            <View className="mt-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: "#FFFCF2", borderColor: "#F0D48A", borderWidth: 1 }}>
              <Text className="font-body text-[12px] leading-[19px] text-warning">
                {preview.coversFullSheet
                  ? `L'avance règle tout ce qui est dû et couvre jusqu'à fin ${preview.coversThroughLabel}${advanceMonths > 0 ? ` (${advanceMonths} mois d'avance)` : ""}.`
                  : `Cette avance partielle règle le rattrapage et couvre jusqu'à la ligne ${previewLineInSheet} de ${preview.coversThroughLabel}${preview.partialAfter > 0 ? `, dont ${formatFCFA(preview.partialAfter)} posés sur la ligne entamée` : ""}.`}
                {"\n"}Après cet encaissement, il restera {formatFCFA(preview.resteAfter)} à prendre sur le livret
                {preview.resteAfter === 0 ? " : il sera entièrement réglé." : "."}
              </Text>
            </View>
          ) : null}
          {preview?.exceedsReste ? (
            <Text className="mt-2 font-medium text-[12px] text-danger">
              Montant supérieur au restant du livret ({formatFCFA(preview.resteBefore)}).
            </Text>
          ) : null}

          <View className="mt-4">
            <Keypad value={advanceInput ?? ""} onChange={setAdvanceInput} />
          </View>
        </View>
      ) : (
        <View className="mt-4">
          <Text className="font-medium text-[11px] uppercase tracking-wide text-ink-muted">
            Lignes du livret à régler
          </Text>
          {view && view.payable.length === 0 ? (
            <View className="mt-3 rounded-xl border border-line bg-[#F4F7FB] p-4">
              <Text className="font-body text-[14px] text-ink-muted">
                Livret entièrement réglé : toutes les lignes encaissables sont couvertes.
              </Text>
            </View>
          ) : null}
          {view && view.due ? (
            <View className="mt-2">
              <Text
                className="mb-1 font-medium text-[11px] uppercase"
                style={{ color: view.late ? colors.danger : colors.inkMuted }}
              >
                {view.late ? `Rattrapage · ${stop.livret.missedLines} ligne(s) en retard` : "Aujourd'hui"}
              </Text>
              <Pressable
                onPress={() => {
                  setLineSel((prev) => {
                    const base = prev ?? (view.due ? [view.due.line] : []);
                    return base.includes(view.due!.line)
                      ? base.filter((l) => l !== view.due!.line)
                      : [...base, view.due!.line].sort((a, b) => a - b);
                  });
                  setAmountInput(null);
                }}
                className="items-center justify-center rounded-xl border"
                style={{
                  width: 86,
                  minHeight: 52,
                  backgroundColor: effectiveSelected.includes(view.due.line)
                    ? colors.primary
                    : view.late
                      ? "#FDECEA"
                      : "#FFF7E0",
                  borderColor: effectiveSelected.includes(view.due.line)
                    ? colors.primary
                    : view.late
                      ? "#F5C6C0"
                      : "#FFB800",
                }}
              >
                <Text
                  className="font-heading text-[12px]"
                  style={{
                    color: effectiveSelected.includes(view.due.line)
                      ? "#FFFFFF"
                      : view.late
                        ? colors.danger
                        : colors.ink,
                  }}
                >
                  {view.late ? "Rattrapage" : "Ligne due"}
                </Text>
                <Text
                  className="mt-0.5 font-medium text-[10px]"
                  style={{
                    color: effectiveSelected.includes(view.due.line)
                      ? "rgba(255,255,255,0.8)"
                      : colors.inkMuted,
                  }}
                >
                  L{view.due.lineInSheet} · {formatFCFA(stop.dailyAmount)}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {view && view.rest.length > 0 ? (
            <View className="mt-3">
              <Text className="mb-1 font-medium text-[11px] uppercase text-ink-muted">
                Lignes suivantes · payer d'avance
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {view.rest.map((p) => {
                  const isSel = effectiveSelected.includes(p.line);
                  return (
                    <Pressable
                      key={p.line}
                      onPress={() => {
                        setLineSel((prev) => {
                          const base = prev ?? (view.due ? [view.due.line] : []);
                          return base.includes(p.line)
                            ? base.filter((l) => l !== p.line)
                            : [...base, p.line].sort((a, b) => a - b);
                        });
                        setAmountInput(null);
                      }}
                      className="items-center justify-center rounded-xl border"
                      style={{
                        width: 86,
                        minHeight: 52,
                        backgroundColor: isSel ? colors.primary : "#FFFFFF",
                        borderColor: isSel ? colors.primary : colors.line,
                      }}
                    >
                      <Text
                        className="font-heading text-[12px]"
                        style={{ color: isSel ? "#FFFFFF" : colors.ink }}
                      >
                        +{p.lineInSheet}
                      </Text>
                      <Text
                        className="mt-0.5 font-medium text-[10px]"
                        style={{ color: isSel ? "rgba(255,255,255,0.8)" : colors.inkMuted }}
                      >
                        L{p.lineInSheet} · {formatFCFA(stop.dailyAmount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Montant (mode ligne à ligne) */}
          <Text className="mt-4 font-medium text-[11px] uppercase tracking-wide text-ink-muted">Montant</Text>
          <View
            className="mt-1 items-center justify-center rounded-xl border-2"
            style={{
              minHeight: 64,
              backgroundColor: overMax || unallocated ? "#FDECEA" : colors.primarySoft,
              borderColor: overMax || unallocated ? colors.danger : colors.primary,
            }}
          >
            <Text
              className="font-heading text-[34px]"
              style={{ color: overMax || unallocated ? colors.danger : colors.primaryDark }}
            >
              {formatFCFA(amount)}
            </Text>
          </View>
          <Text className="mt-1.5 font-body text-[12px] text-ink-muted">
            {effectiveSelected.length > 0
              ? `${effectiveSelected.length} ligne(s) × ${formatFCFA(stop.dailyAmount)} · reste du livret : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`
              : `Mise du jour : ${formatFCFA(stop.dailyAmount)} · reste du livret : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`}
          </Text>
          {unallocated ? (
            <Text className="mt-1 font-medium text-[12px] text-danger">
              Montant supérieur aux lignes sélectionnées. Sélectionne davantage de lignes à venir.
            </Text>
          ) : null}
          {overMax ? (
            <Text className="mt-1 font-medium text-[12px] text-danger">
              Montant supérieur au restant du livret ({formatFCFA(Math.max(0, cycleTotal - stop.balance))}).
            </Text>
          ) : null}

          <View className="mt-4">
            <Keypad value={amountInput ?? ""} onChange={setAmountInput} />
          </View>
        </View>
      )}

      {/* Bouton Encaisser */}
      <Pressable
        onPress={() => void submit()}
        disabled={!canSubmit}
        className="mt-5 items-center justify-center rounded-xl"
        style={{
          minHeight: 60,
          backgroundColor: mode === "advance" ? "#A66A00" : colors.primary,
          opacity: canSubmit ? 1 : 0.5,
        }}
      >
        <Text className="font-heading text-[16px] text-white">
          {saving
            ? "Enregistrement…"
            : mode === "advance" && preview && preview.valid && !preview.exceedsReste
              ? `Encaisser l'avance ${formatFCFA(preview.amount)}`
              : `Encaisser ${formatFCFA(amount)}`}
        </Text>
        {mode === "advance" && preview && preview.valid && !preview.exceedsReste ? (
          <Text className="mt-0.5 font-medium text-[11px] text-white/80">
            {preview.coversFullSheet
              ? `couvre jusqu'à fin ${preview.coversThroughLabel}`
              : `couvre la ligne ${previewLineInSheet} de ${preview.coversThroughLabel}`}
          </Text>
        ) : mode === "lines" && allocations.length > 1 ? (
          <Text className="mt-0.5 font-medium text-[11px] text-white/80">
            {allocations.length} lignes · du n°{allocations[0].line} au n°{allocations[allocations.length - 1].line}
          </Text>
        ) : null}
      </Pressable>
      {closing?.status === "validated" ? (
        <Text className="mt-2 text-center font-medium text-[12px] text-danger">
          Clôture validée : les encaissements du jour sont verrouillés.
        </Text>
      ) : null}
      {blocked ? (
        <Text className="mt-2 text-center font-medium text-[12px] text-danger">
          Hors ligne depuis plus de 7 jours : synchronise (onglet Compte) avant de continuer.
        </Text>
      ) : null}

      {/* Confirmation locale : la file tient l'envoi (accusés §8.2 asynchrones) */}
      {savedCount ? (
        <View className="mt-3 rounded-xl px-4 py-3" style={{ backgroundColor: colors.primarySoft }}>
          <Text className="font-body text-[13px] leading-[19px] text-primary-dark">
            {savedCount} écriture{savedCount > 1 ? "s" : ""} enregistrée{savedCount > 1 ? "s" : ""} sur le téléphone —{" "}
            {pending > 0
              ? "envoi en cours, le carnet se met à jour dès l'accusé du serveur."
              : "envoyée : le carnet du cotisant se met à jour sur son lien dès l'écriture."}
          </Text>
        </View>
      ) : null}
      {rejectedCount > 0 ? (
        <View className="mt-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
          <Text className="font-body text-[13px] leading-[19px] text-danger">
            {rejectedCount} écriture{rejectedCount > 1 ? "s" : ""} refusée{rejectedCount > 1 ? "s" : ""} par le serveur —
            détails dans l'onglet Compte.
          </Text>
        </View>
      ) : null}

      <Text className="mt-3 text-center font-body text-[11px] leading-[17px] text-ink-muted">
        Enregistrement chiffré sur le téléphone puis envoi automatique — en ligne l'accusé revient en
        quelques secondes, hors ligne la file reprend seule (2/4/8/16 s puis 5 min).
      </Text>
    </ScrollView>
  );
}
