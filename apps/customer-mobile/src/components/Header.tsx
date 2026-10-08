import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Brand } from './Brand';
import { Body } from './ui';
import { colors } from '../theme/tokens';
import { useDraft } from '../features/collection/DraftProvider';
export function Header({
  back = false,
  address = true,
}: {
  back?: boolean;
  address?: boolean;
}) {
  const draft = useDraft();
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingTop: 6,
        paddingBottom: 10,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/')
            }
            style={{ padding: 8 }}
          >
            <Ionicons name="chevron-back" size={25} color={colors.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Brand />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => router.push('/notifications')}
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 30,
          }}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={colors.text}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help and support"
          onPress={() => router.push('/information?topic=Help%20%26%20Support')}
          style={{ padding: 10 }}
        >
          <Ionicons name="help-circle-outline" size={25} color={colors.text} />
        </Pressable>
      </View>
      {address && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose pickup address"
          onPress={() => router.push('/addresses')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: 11,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
          }}
        >
          <Ionicons name="location" size={19} color={colors.gold} />
          <Body numberOfLines={1} style={{ flex: 1, color: colors.text }}>
            {draft.address?.address ?? 'Choose your pickup address'}
          </Body>
          <Ionicons name="chevron-down" size={18} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}
