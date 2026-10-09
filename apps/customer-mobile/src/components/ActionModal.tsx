import type { PropsWithChildren } from 'react';
import { Modal, ScrollView, View, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heading, TextAction, styles } from './ui';
import { colors } from '../theme/tokens';
export function ActionModal({
  visible,
  title,
  close,
  children,
  dismissible = true,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  close(): void;
  dismissible?: boolean;
}>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (dismissible) close();
      }}
      onShow={() => AccessibilityInfo.announceForAccessibility(title)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(17,17,17,0.35)',
          justifyContent: 'flex-end',
        }}
      >
        <SafeAreaView
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={{
            backgroundColor: colors.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '90%',
          }}
          edges={['bottom']}
        >
          <View
            style={{
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Heading
              style={{ flex: 1, fontSize: 29, lineHeight: 33, marginBottom: 0 }}
            >
              {title}
            </Heading>
            {dismissible && <TextAction label="Close" onPress={close} />}
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
