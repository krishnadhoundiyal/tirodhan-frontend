// Background handler registration precedes Expo Router's root registration.
require('./src/notifications/bootstrap').installBackgroundNotifications();
require('expo-router/entry');
