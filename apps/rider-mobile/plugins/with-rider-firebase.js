/** @type {import('expo/config-plugins').ConfigPlugin<{android: boolean, ios: boolean}>} */
const withRiderFirebase = (config, enabled) => {
  if (!enabled.android && !enabled.ios) return config;
  // RNFB's public plugin registers mods for both platforms. Keep existing mods
  // unchanged on a platform without its Firebase application configuration.
  const previous = {
    android: { ...config.mods?.android },
    ios: { ...config.mods?.ios },
  };
  const app = require('@react-native-firebase/app/app.plugin');
  const messaging = require('@react-native-firebase/messaging/app.plugin');
  const next = messaging(app(config));
  if (next.mods) {
    if (!enabled.android) next.mods.android = previous.android;
    if (!enabled.ios) next.mods.ios = previous.ios;
  }
  return next;
};
module.exports = withRiderFirebase;
