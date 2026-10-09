import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../src/components/Brand';
import {
  Body,
  Heading,
  TextAction,
  Skeleton,
  StatusCard,
  styles,
} from '../src/components/ui';
import { repositories } from '../src/lib/repositories';
const topics: Record<string, string> = {
  'About Tirodhan': 'about',
  'Help & Support': 'help',
  'Terms & Conditions': 'terms',
  'Privacy Policy': 'privacy',
  about: 'about',
  help: 'help',
  terms: 'terms',
  privacy: 'privacy',
};
export default function Information() {
  const { topic } = useLocalSearchParams<{ topic?: string }>(),
    slug = topics[topic ?? 'About Tirodhan'];
  const query = useQuery({
    queryKey: ['content', slug],
    queryFn: ({ signal }) => repositories.content(slug!, signal),
    enabled: !!slug,
    staleTime: 300000,
  });
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextAction
          label="← Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/login')
          }
        />
        <Brand />
        <Heading>{query.data?.title ?? topic ?? 'About Tirodhan'}</Heading>
        {query.isPending && slug && <Skeleton height={140} />}
        {query.isError && (
          <StatusCard
            title="This information is unavailable"
            error={query.error}
            retry={() => void query.refetch()}
          />
        )}
        {query.data?.paragraphs.map((paragraph, index) => (
          <Body key={index}>{paragraph}</Body>
        ))}
        {!slug && <Body>This information is unavailable.</Body>}
      </ScrollView>
    </SafeAreaView>
  );
}
