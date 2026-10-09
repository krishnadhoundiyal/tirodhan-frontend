import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Media } from './model';
import { trustedMediaUrl } from './model';
import { previewCatalogue } from '../../lib/runtime';
import { colors } from '../../theme/tokens';
import { Body } from '../../components/ui';
const developmentAssets: typeof import('../collection/assets').assets | null =
  // Static development guard lets Metro exclude fixture artwork from release imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  __DEV__ ? require('../collection/assets').assets : null;

export function mediaSource(
  media: Media | null,
  preview: boolean,
  thumbnail = false,
) {
  if (
    media?.expires_at &&
    (!Number.isFinite(Date.parse(media.expires_at)) ||
      Date.parse(media.expires_at) <= Date.now())
  )
    return undefined;
  const url = trustedMediaUrl(
    thumbnail
      ? (media?.thumbnail_url ?? media?.url ?? null)
      : (media?.url ?? null),
  );
  if (url) return { uri: url };
  return preview && media?.developmentAssetKey
    ? developmentAssets?.[media.developmentAssetKey]
    : undefined;
}
export default function MediaImage({
  media,
  style,
  thumbnail = false,
  fit = 'cover',
  fallback = 'image-outline',
}: {
  media: Media | null;
  style: ViewStyle;
  thumbnail?: boolean;
  fit?: 'cover' | 'contain';
  fallback?:
    'image-outline' | 'home-outline' | 'bicycle-outline' | 'business-outline';
}) {
  const source = mediaSource(media, previewCatalogue, thumbnail);
  const [failedSource, setFailedSource] = useState<typeof source>();
  const [loadedSource, setLoadedSource] = useState<typeof source>();
  const identity = typeof source === 'object' ? source.uri : source;
  const failedIdentity =
    typeof failedSource === 'object' ? failedSource.uri : failedSource;
  const loadedIdentity =
    typeof loadedSource === 'object' ? loadedSource.uri : loadedSource;
  const failed = !source || failedIdentity === identity;
  return (
    <View
      style={[{ overflow: 'hidden', backgroundColor: colors.tint }, style]}
      accessibilityLabel={media?.alt_text ?? 'Collection illustration'}
    >
      {failed ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 8,
          }}
        >
          <Ionicons name={fallback} size={30} color={colors.goldText} />
          {failedSource && (
            <Body style={{ fontSize: 10, textAlign: 'center' }}>
              Image unavailable
            </Body>
          )}
        </View>
      ) : (
        <>
          <Image
            source={source}
            alt={media?.alt_text ?? 'Collection illustration'}
            contentFit={fit}
            cachePolicy="memory-disk"
            recyclingKey={String(identity)}
            placeholder={
              media?.blurhash ? { blurhash: media.blurhash } : undefined
            }
            placeholderContentFit={fit}
            transition={120}
            style={{ width: '100%', height: '100%' }}
            onLoad={() => setLoadedSource(source)}
            onError={() => setFailedSource(source)}
          />
          {loadedIdentity !== identity && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', bottom: 5, right: 5 }}
              accessibilityLabel="Loading image"
              accessibilityState={{ busy: true }}
            >
              <Ionicons
                name="image-outline"
                size={15}
                color={colors.goldText}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}
