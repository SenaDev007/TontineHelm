#!/usr/bin/env bun
// @tontihelm/domain — synchronisation vers le backend (étape transitoire de la phase 1).
// Le paquet est la source de vérité ; le backend consomme une copie vérifiée
// jusqu'au branchement des workspaces du monorepo (déplacement apps/web
// coordonné avec le réglage Vercel Root Directory, cf. PARITE.md §9).
//   bun run check  → échoue (exit 1) si le backend diverge du paquet
//   bun run push   → recopie src/ vers backend/src/lib/
import { copyFileSync, readFileSync } from "node:fs";

const FILES = ["domain.ts", "livret.ts", "plans.ts"];
const pkg = (f) => new URL(`./src/${f}`, import.meta.url);
const backend = (f) => new URL(`../../backend/src/lib/${f}`, import.meta.url);

const mode = process.argv[2] ?? "check";
if (mode !== "check" && mode !== "push") {
  console.error("Usage : bun sync.mjs [check|push]");
  process.exit(2);
}

let drift = 0;
for (const f of FILES) {
  let same = false;
  try {
    same = readFileSync(pkg(f)).equals(readFileSync(backend(f)));
  } catch {
    same = false;
  }
  if (same) {
    console.log(`=  ${f} : identique au backend`);
  } else {
    drift += 1;
    console.log(`≠  ${f} : DIVERGENT du backend`);
    if (mode === "push") {
      copyFileSync(pkg(f), backend(f));
      console.log(`   → ${f} recopié vers backend/src/lib/`);
    }
  }
}

if (mode === "check") {
  if (drift > 0) {
    console.error(`\n${drift} fichier(s) en dérive — exécute « bun run push » puis relance les tests backend.`);
    process.exit(1);
  }
  console.log("\nSource de vérité et backend synchronisés (diff nul).");
}
