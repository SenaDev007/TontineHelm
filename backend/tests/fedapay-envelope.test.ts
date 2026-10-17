// Test unitaire du dépaquetage de l'enveloppe v1 FedaPay (bug « Transaction
// non trouvée »). Formes documentées par Academia Helm + docs officielles :
//   { "v1/transaction": {...} } | { transaction: {...} } | { data: {...} }
//   { v1/transactions: [...] }  | { id, ... } (direct)
import process from "node:process";
process.env.FEDAPAY_SECRET_KEY = "sk_sandbox_testkey";
process.env.FEDAPAY_PUBLIC_KEY = "pk_sandbox_testkey";

const SHAPES: Record<string, unknown> = {
  "v1/transaction (format RÉEL)": {
    "v1/transaction": { id: 41827, reference: "TRX-41827", amount: 15000, status: "pending", token: "tok_abc" },
  },
  "transaction (standard)": {
    transaction: { id: 99, reference: "TRX-99", amount: 15000, status: "approved" },
  },
  "data (SDK)": {
    data: { id: 7, reference: "TRX-7", amount: 15000, status: "declined" },
  },
  "v1/transactions[0] (liste)": {
    "v1/transactions": [{ id: 55, reference: "TRX-55", amount: 35000, status: "pending" }],
  },
  "direct": {
    id: 12, reference: "TRX-12", amount: 15000, status: "pending",
  },
};

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok — ${label}`);
  else {
    failures++;
    console.error(`  ÉCHEC — ${label}${detail ? ` : ${detail}` : ""}`);
  }
}

// Import dynamique APRÈS les variables d'environnement.
const { fedapayCreateTransaction, fedapayGetTransaction, fedapayEnvironment, fedapayKeysCoherent, FedaPayApiError } =
  await import("../src/lib/fedapay");

console.log("== Environnement dérivé des clés ==");
check("sk_sandbox → sandbox", fedapayEnvironment() === "sandbox");
check("clés cohérentes (pk_sandbox + sk_sandbox)", fedapayKeysCoherent() === true);

console.log("\n== Création de transaction (toutes les formes de réponse) ==");
for (const [label, body] of Object.entries(SHAPES)) {
  const b = body as Record<string, any>;
  const expectedTx = b["v1/transaction"] ?? b.transaction ?? b.data ?? b["v1/transactions"]?.[0] ?? b;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/token")) {
      return new Response(JSON.stringify({ token: "tok_xyz", url: "https://sandbox.fedapay.com/r/tok_xyz" }), { status: 200 });
    }
    if ((init?.method ?? "GET") === "POST") {
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  try {
    const tx = await fedapayCreateTransaction({
      amount: 15000,
      description: "Test",
      callbackUrl: "https://tontine-helm.vercel.app/inscription?paymentId=x&status=return",
      metadata: { type: "signup" },
    });
    check(`${label} → id=${expectedTx.id}`, tx.transactionId === String(expectedTx.id), `reçu ${tx.transactionId}`);
    check(`${label} → reference=${expectedTx.reference}`, tx.reference === String(expectedTx.reference), `reçu ${tx.reference}`);
    check(`${label} → paymentUrl du point /token`, tx.paymentUrl === "https://sandbox.fedapay.com/r/tok_xyz", `reçu ${tx.paymentUrl}`);

    const verif = await fedapayGetTransaction(tx.transactionId);
    check(`${label} → statut=${expectedTx.status}`, verif.status === String(expectedTx.status), `reçu ${verif.status}`);
    check(`${label} → amount=${expectedTx.amount}`, verif.amount === expectedTx.amount, `reçu ${verif.amount}`);
  } catch (err) {
    failures++;
    console.error(`  ÉCHEC — ${label} a levé : ${(err as Error).message}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("\n== Garde anti-« undefined » ==");
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "nope" }), { status: 200 })) as typeof fetch;
  try {
    await fedapayCreateTransaction({ amount: 1, description: "x", callbackUrl: "https://x.example/cb", metadata: {} });
    failures++;
    console.error("  ÉCHEC — une réponse sans id aurait dû lever");
  } catch (err) {
    check("réponse sans id → erreur claire (pas « undefined »)", (err as Error).message.includes("identifiant"));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("\n== 404 FedaPay (transaction définitivement absente) ==");
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "Model V1::Transaction not found" }), { status: 404 })) as typeof fetch;
  try {
    await fedapayGetTransaction("123456");
    failures++;
    console.error("  ÉCHEC — le 404 aurait dû lever FedaPayApiError");
  } catch (err) {
    check("404 → FedaPayApiError httpStatus=404",
      err instanceof FedaPayApiError && err.httpStatus === 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log(failures === 0 ? "\nTOUS LES TESTS PASSENT ✔" : `\n${failures} ÉCHEC(S) ✘`);
process.exit(failures === 0 ? 0 : 1);
