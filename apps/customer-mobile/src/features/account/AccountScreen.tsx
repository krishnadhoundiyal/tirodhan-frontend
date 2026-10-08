import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Header } from '../../components/Header';
import { Body, Button, Card, Heading, styles } from '../../components/ui';
import { colors } from '../../theme/tokens';
import { logout } from '../../lib/runtime';
import { clearNotificationCredential } from '../../notifications/integration';
const sections = [
  {
    title: 'My Account',
    rows: [
      [
        'location-outline',
        'Saved Addresses',
        'Manage your pickup locations',
        '/addresses',
      ],
      ['card-outline', 'Payment Methods', 'Manage your saved payment options'],
      ['heart-outline', 'Favourites', 'Your saved items and collections'],
      [
        'time-outline',
        'Activity',
        'Track your pickup journeys and history',
        '/activity',
      ],
    ],
  },
  {
    title: 'Support',
    rows: [
      ['headset-outline', 'Help & Support', 'Get help, FAQs and contact us'],
      ['chatbox-outline', 'Share Feedback', 'Help us improve Tirodhan'],
    ],
  },
  {
    title: 'Preferences',
    rows: [
      ['globe-outline', 'Language', 'English (India)'],
      [
        'notifications-outline',
        'Notifications',
        'Manage your notification preferences',
        '/notifications',
      ],
    ],
  },
  {
    title: 'About',
    rows: [
      [
        'information-circle-outline',
        'About Tirodhan',
        'Our mission, story and more',
      ],
      [
        'document-text-outline',
        'Terms & Conditions',
        'Read our terms of service',
      ],
      [
        'shield-checkmark-outline',
        'Privacy Policy',
        'How we protect your data',
      ],
    ],
  },
] as const;
export default function AccountScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } catch {
      setError(
        'You are signed out on this device. We couldn’t confirm server revocation.',
      );
    } finally {
      clearNotificationCredential();
      setBusy(false);
      router.replace('/login');
    }
  };
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <Header />
      <FlatList
        data={sections}
        keyExtractor={(item) => item.title}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Heading>Account</Heading>
            <Card>
              <View
                style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}
              >
                <View
                  style={{
                    backgroundColor: colors.tint,
                    padding: 18,
                    borderRadius: 50,
                  }}
                >
                  <Ionicons name="person" color={colors.gold} size={30} />
                </View>
                <View style={{ flex: 1 }}>
                  <Heading style={{ fontSize: 27 }}>
                    Your Tirodhan account
                  </Heading>
                  <Body>
                    Profile details will appear when account information is
                    available.
                  </Body>
                </View>
              </View>
            </Card>
          </>
        }
        renderItem={({ item }) => (
          <View style={{ marginTop: 22 }}>
            <Heading style={{ fontSize: 28 }}>{item.title}</Heading>
            <Card style={{ paddingVertical: 0 }}>
              {item.rows.map((row, index) => (
                <Pressable
                  key={row[1]}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push(
                      (row.length === 4
                        ? row[3]
                        : `/information?topic=${encodeURIComponent(row[1])}`) as Href,
                    )
                  }
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'center',
                    paddingVertical: 13,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: colors.tint,
                      padding: 10,
                      borderRadius: 30,
                    }}
                  >
                    <Ionicons name={row[0]} size={23} color={colors.goldText} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Heading
                      style={{ fontSize: 23, lineHeight: 25, marginBottom: 2 }}
                    >
                      {row[1]}
                    </Heading>
                    <Body style={{ fontSize: 12 }}>{row[2]}</Body>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={21}
                    color={colors.goldText}
                  />
                </Pressable>
              ))}
            </Card>
          </View>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 20, gap: 12 }}>
            {error && <Body accessibilityRole="alert">{error}</Body>}
            <Button
              secondary
              label="Logout →"
              busy={busy}
              onPress={() => void signOut()}
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}
