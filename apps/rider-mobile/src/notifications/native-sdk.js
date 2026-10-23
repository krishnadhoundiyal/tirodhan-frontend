// Synchronous lazy boundary: the background handler must precede Router registration.
/** @returns {typeof import('@react-native-firebase/messaging')} */
module.exports = () => require('@react-native-firebase/messaging');
