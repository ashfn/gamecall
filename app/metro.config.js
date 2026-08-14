const { getDefaultConfig } = require("expo/metro-config");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);

// Zustand's ESM distribution uses import.meta.env. Metro currently emits that
// expression into a classic web script, which makes the exported app fail at
// parse time. Resolve only Zustand through its CommonJS entry points instead.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^zustand(?:\/|$)/.test(moduleName)) {
    return context.resolveRequest(context, require.resolve(moduleName), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
