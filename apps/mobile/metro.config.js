// TontiHelm mobile — Metro : dossiers surveillés pour importer les PAQUETS
// PARTAGÉS du monorepo (@tontihelm/domain, @tontihelm/schemas, @tontihelm/sync)
// sans copie. Ces paquets sont en TypeScript source pur (zéro build) : Metro
// les compile avec l'application (même mécanisme que celui documenté dans
// packages/domain/README.md, phase 1 du brief mobile).
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [
  path.resolve(monorepoRoot, "packages/domain"),
  path.resolve(monorepoRoot, "packages/schemas"),
  path.resolve(monorepoRoot, "packages/sync"),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = withNativeWind(config, { cssRelativeToProject: false, input: "./global.css" });
