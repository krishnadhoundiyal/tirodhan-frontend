import Svg, { Path, Circle } from 'react-native-svg';
import { View, Text } from 'react-native';
import { colors, fonts } from '../theme/tokens';
export function Lotus({ size = 42 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityLabel="Tirodhan lotus and flame"
    >
      <Circle cx="50" cy="7" r="3" fill={colors.gold} />
      <Path
        d="M50 16 C38 29 21 38 24 55 C26 65 40 66 48 80 M50 16 C62 29 79 38 76 55 C74 65 62 66 53 80 M49 88 C45 63 26 61 9 65 C17 82 32 86 45 76 M52 88 C56 63 75 61 91 65 C83 82 68 86 55 76"
        stroke={colors.gold}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M50 35 C48 48 39 53 41 61 C42 68 48 70 49 68 C43 57 52 56 52 49 C54 55 63 65 53 71 C70 64 56 43 50 35Z"
        fill={colors.gold}
      />
    </Svg>
  );
}
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <View
      style={{
        flexDirection: large ? 'column' : 'row',
        alignItems: 'center',
        gap: large ? 8 : 5,
      }}
    >
      <Lotus size={large ? 106 : 34} />
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: large ? 64 : 32,
          color: colors.text,
        }}
      >
        Tirodhan
      </Text>
    </View>
  );
}
