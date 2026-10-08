import { useLocalSearchParams, router } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../src/components/Brand';
import { Body, Heading, TextAction, styles } from '../src/components/ui';
export default function Information() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
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
        <Heading>{topic ?? 'About Tirodhan'}</Heading>
        <Body>
          {topic === 'About Tirodhan'
            ? 'Tirodhan arranges respectful household collection of sacred items and handover to designated government or authorised receiving locations.'
            : 'This information is not available yet. Please check back soon.'}
        </Body>
      </ScrollView>
    </SafeAreaView>
  );
}
