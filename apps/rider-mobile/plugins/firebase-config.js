const { existsSync } = require('node:fs');
const { join } = require('node:path');
module.exports = () => ({
  android:
    process.env.EXPO_PUBLIC_RIDER_MODE !== 'SCREEN_PREVIEW' &&
    existsSync(join(__dirname, '..', 'google-services.json')),
  ios:
    process.env.EXPO_PUBLIC_RIDER_MODE !== 'SCREEN_PREVIEW' &&
    existsSync(join(__dirname, '..', 'GoogleService-Info.plist')),
});
/* global __dirname */
