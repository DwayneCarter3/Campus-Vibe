module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        require.resolve("expo/internal/babel-preset"),
        {
          unstable_transformImportMeta: true,
          // pnpm isolates the preset from the app's animation dependencies.
          // Resolve the plugin here instead of relying on preset auto-detection.
          worklets: false,
          reanimated: false,
        },
      ],
    ],
    plugins: [require.resolve("react-native-worklets/plugin")],
  };
};
