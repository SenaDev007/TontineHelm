// @tontihelm/domain — source de vérité des règles métier pures TontiHelm.
// Extraite à l'identique de backend/src/lib (phase 1) APRÈS écriture des tests
// de non-régression (backend/tests/domain.regression.test.ts — 25 tests, 132
// assertions, tous verts avant et après extraction).
// Aucune dépendance externe ; tous les montants sont des entiers (FCFA).
export * from "./domain";
export * from "./livret";
export * from "./plans";
