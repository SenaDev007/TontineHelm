// TontiHelm mobile — Babel : preset Expo + NativeWind (JSX traités par nativewind).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: ["nativewind/babel"],
  };
};
