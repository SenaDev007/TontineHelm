// TontiHelm mobile — écran Encaisser (2026-10-18) : correction du dirigeant —
// l'AVANCE n'est pas obligatoirement le total du mois : le cotisant peut verser
// une PARTIE. L'agent saisit le montant désiré (pavé numérique) ; les puces de
// feuille restent des raccourcis qui préremplissent le total. Même logique que
// le web : advancePreview() vient du paquet partagé @tontihelm/domain.
// Mode « Ligne à ligne » : due / rattrapage / lignes suivantes (avance), comme
// le web. Envoi immédiat /v1/sync/push (en ligne) — la file hors ligne arrive
// en phase 2 ; les accusés PAR ÉVÉNEMENT s'affichent (accepté / doublon /
// rejeté + motif), puis la traction delta rafraîchit l'écran.
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View, Vibration } from "react-native";
import { colors } from "@/theme/tokens";
import { useSession } from "@/lib/session";
import { useTour, todayOf } from "@/lib/tour-store";
import { uuidv7 } from "@/lib/uuid7";
import { ApiClientError } from "@/lib/api";
import { advancePreview, formatFCFA } from "@tontihelm/domain";

type Mode = "lines" | "advance";

interface AckRow {
  amount: number;
  status: "accepted" | "duplicate" | "rejected";
  message?: string;
}

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

function RealtimePill({ state }: { state: "connecting" | "open" | "reconnecting" }) {
  const label = state === "open" ? "Temps réel actif" : state === "connecting" ? "Connexion…" : "Reconnexion…";
  const color = state === "open" ? colors.primary : colors.warning;
  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.goldSoft }}>
      <Text className="font-medium text-[11px]" style={{ color }}>
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
  const authedPost = useSession((s) => s.authedPost);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("lines");
  const [lineSel, setLineSel] = useState<number[] | null>(null); // null = ligne due
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [advanceInput, setAdvanceInput] = useState<string | null>(null); // null = preset
  const [pushing, setPushing] = useState(false);
  const [acks, setAcks] = useState<AckRow[] | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

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
    !pushing &&
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
    setAcks(null);
    setPushError(null);
  };

  const submit = async () => {
    if (!stop || !canSubmit) return;
    setPushing(true);
    setPushError(null);
    setAcks(null);
    try {
      const events =
        mode === "advance" && preview
          ? [{
              id: uuidv7(),
              passbookId: stop.passbookId,
              amount: preview.amount,
              method: "cash",
              advance: true,
              collectedAt: new Date().toISOString(),
            }]
          : allocations.map((a) => ({
              id: uuidv7(),
              passbookId: stop.passbookId,
              amount: a.amount,
              method: "cash",
              advance: false,
              collectedAt: new Date().toISOString(),
            }));
      const body = (await authedPost("/v1/sync/push", {
        events,
        clientTime: new Date().toISOString(),
      })) as {
        acks?: { id: string; status: "accepted" | "duplicate" | "rejected"; reason?: { message?: string } }[];
      };
      const byId = new Map((body.acks ?? []).map((a) => [a.id, a]));
      setAcks(
        events.map((ev) => {
          const ack = byId.get(ev.id);
          return {
            amount: ev.amount,
            status: ack?.status ?? "rejected",
            message: ack?.reason?.message,
          };
        })
      );
      const ok = (body.acks ?? []).every((a) => a.status === "accepted" || a.status === "duplicate");
      if (ok) Vibration.vibrate(60);
      // Traction delta : l'écran (et le web connecté) reflètent l'écriture.
      await refresh();
      setLineSel(null);
      setAmountInput(null);
      setAdvanceInput(null);
    } catch (err) {
      setPushError(
        err instanceof ApiClientError ? err.message : "Envoi impossible. Vérifie ta connexion et réessaie."
      );
    } finally {
      setPushing(false);
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
          <RealtimePill state={realtime} />
        </View>
        <Text className="mt-1 font-body text-base text-ink-muted">
          {ready
            ? collectable.length > 0
              ? `${collectable.length - done.length} client${collectable.length - done.length > 1 ? "s" : ""} à encaisser aujourd'hui.`
              : "Tous tes clients du jour sont encaissés."
            : "Chargement de la tournée…"}
        </Text>
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
        <RealtimePill state={realtime} />
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
          {pushing
            ? "Envoi…"
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

      {/* Accusés PAR ÉVÉNEMENT (§8.2) */}
      {acks ? (
        <View className="mt-3 rounded-xl border border-line bg-[#F4F7FB] px-3 py-2.5">
          <Text className="mb-1.5 font-medium text-[11px] uppercase tracking-wide text-ink-muted">
            Accusés du serveur
          </Text>
          {acks.map((a, i) => (
            <Text
              key={i}
              className="font-body text-[12px] leading-[19px]"
              style={{
                color:
                  a.status === "accepted"
                    ? colors.primaryDark
                    : a.status === "duplicate"
                      ? colors.warning
                      : colors.danger,
              }}
            >
              {formatFCFA(a.amount)} —{" "}
              {a.status === "accepted"
                ? "écriture acceptée"
                : a.status === "duplicate"
                  ? "doublon (déjà enregistré)"
                  : `rejetée : ${a.message ?? "motif inconnu"}`}
            </Text>
          ))}
        </View>
      ) : null}
      {pushError ? (
        <View className="mt-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
          <Text className="font-body text-[13px] leading-[19px] text-danger">{pushError}</Text>
        </View>
      ) : null}

      <Text className="mt-3 text-center font-body text-[11px] leading-[17px] text-ink-muted">
        Envoi en ligne immédiat — la file hors ligne arrive en phase 2. Le carnet du cotisant se met à
        jour sur son lien dès l'écriture.
      </Text>
    </ScrollView>
  );
}
