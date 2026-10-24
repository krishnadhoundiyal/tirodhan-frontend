const configured = require('./plugins/firebase-config')();
const platforms = {
  android: configured.android ? undefined : null,
  ios: configured.ios ? undefined : null,
};
// iOS messaging installs native launch observers. Exclude the native libraries
// entirely from unconfigured/preview platforms, before any JavaScript can run.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms },
    '@react-native-firebase/messaging': { platforms },
  },
};
