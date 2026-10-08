import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { colors, fonts } from '../../../src/theme/tokens';
const icons = {
  index: 'home-outline',
  bookings: 'calendar-outline',
  pickup: 'add',
  activity: 'receipt-outline',
  account: 'person-outline',
} as const;
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.goldText,
        tabBarInactiveTintColor: colors.secondary,
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 10 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 78,
          paddingTop: 8,
        },
        tabBarIcon: ({ color }) =>
          route.name === 'pickup' ? (
            <View
              style={{
                backgroundColor: colors.gold,
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -18,
                borderWidth: 3,
                borderColor: colors.surface,
              }}
            >
              <Ionicons name="add" size={29} color="white" />
            </View>
          ) : (
            <Ionicons
              name={icons[route.name as keyof typeof icons]}
              color={color}
              size={24}
            />
          ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="pickup" options={{ title: 'Book Pickup' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
