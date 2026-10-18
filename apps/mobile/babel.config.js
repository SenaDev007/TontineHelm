// TontiHelm mobile — Babel : preset Expo + PRESET NativeWind. Correction de
// phase 2 : nativewind/babel s'inscrit comme PRESET (il exporte un objet
// { plugins: [...] }), pas comme plugin — l'ancienne inscription cassait tout
// bundle au premier fichier (« .plugins is not a valid Plugin property »,
// piégé par l'export de vérification Metro ; la doc officielle NativeWind v4
// prescribe ce montage). babel-preset-expo (SDK 54) injecte lui-même les
// plugins reanimated/worklets — aucune inscription manuelle ici.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
