import { Tabs } from 'expo-router';
import { Admission } from '../../src/features/Admission';
import { colors, fonts } from '../../src/theme/tokens';
export default function RiderLayout() {
  return (
    <Admission>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.goldText,
          tabBarStyle: { backgroundColor: colors.surface },
          tabBarLabelStyle: { fontFamily: fonts.medium },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="offers" options={{ title: 'Offers' }} />
        <Tabs.Screen name="assignment" options={{ title: 'Active work' }} />
        <Tabs.Screen name="evidence" options={{ title: 'Evidence' }} />
        <Tabs.Screen name="account" options={{ title: 'Account' }} />
      </Tabs>
    </Admission>
  );
}
