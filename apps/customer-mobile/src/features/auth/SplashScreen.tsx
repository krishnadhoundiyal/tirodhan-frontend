import { View, Text, ActivityIndicator } from 'react-native';
import { Brand } from '../../components/Brand';
import { colors, fonts } from '../../theme/tokens';
export default function SplashScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.cream,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Brand large />
      <Text style={{ color: colors.gold, marginVertical: 12 }}>
        ────── ◆ ──────
      </Text>
      <Text
        style={{
          fontFamily: fonts.hindi,
          fontSize: 25,
          lineHeight: 40,
          color: colors.goldText,
          textAlign: 'center',
        }}
      >
        श्रद्धा से संग्रह{'\n'}सम्मान से प्रस्थान
      </Text>
      <View style={{ position: 'absolute', bottom: '14%' }}>
        <ActivityIndicator
          color={colors.gold}
          accessibilityLabel="Starting Tirodhan"
        />
      </View>
    </View>
  );
}
