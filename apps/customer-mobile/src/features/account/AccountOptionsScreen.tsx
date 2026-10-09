import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '../../components/Header';
import {
  Body,
  Button,
  Card,
  Heading,
  Skeleton,
  StatusCard,
  styles,
} from '../../components/ui';
import { repositories } from '../../lib/repositories';
import { useCatalogue, useCustomerOwner } from '../collection/queries';
import type { PreparedCommand } from '../../api/transport';
import type {
  CustomerProfile,
  CustomerPreferences,
  FavouriteCategories,
} from '../../api/customer-contracts';
import { userMessage } from '../../api/errors';
import { colors } from '../../theme/tokens';

function usePreparedSave<B extends { client_request_id: string }, R>(
  prepare: (body: B) => PreparedCommand<R>,
  key: readonly string[],
) {
  const queryClient = useQueryClient(),
    prepared = useRef<{
      fingerprint: string;
      command: PreparedCommand<R>;
    } | null>(null);
  return useMutation({
    mutationFn: (body: B) => {
      const fingerprint = JSON.stringify(body);
      if (prepared.current?.fingerprint !== fingerprint)
        prepared.current = {
          fingerprint,
          command: prepare({ ...body, client_request_id: randomUUID() }),
        };
      return prepared.current.command.execute();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
    retry: false,
  });
}
function ProfileForm({ profile }: { profile: CustomerProfile }) {
  const owner = useCustomerOwner(),
    id = useRef(randomUUID());
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      display_name: profile.display_name ?? '',
      email: profile.email ?? '',
    },
  });
  const save = usePreparedSave(repositories.updateProfile, ['profile', owner]);
  return (
    <Card>
      <Heading style={{ fontSize: 26 }}>Your profile</Heading>
      <Body>{profile.phone_display}</Body>
      {(['display_name', 'email'] as const).map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          rules={{
            maxLength: name === 'email' ? 254 : 100,
            validate: (value) =>
              name !== 'email' ||
              !value ||
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
              'Enter a valid email address.',
          }}
          render={({ field }) => (
            <View>
              <Body>
                {name === 'email' ? 'Email · optional' : 'Name · optional'}
              </Body>
              <TextInput
                accessibilityLabel={name === 'email' ? 'Email' : 'Name'}
                style={styles.input}
                value={field.value}
                onChangeText={field.onChange}
                autoCapitalize={name === 'email' ? 'none' : 'words'}
                keyboardType={name === 'email' ? 'email-address' : 'default'}
                maxLength={name === 'email' ? 254 : 100}
              />
              {errors[name] && (
                <Body accessibilityRole="alert">{errors[name]?.message}</Body>
              )}
            </View>
          )}
        />
      ))}
      {save.isError && (
        <Body accessibilityRole="alert">{userMessage(save.error)}</Body>
      )}
      {save.isSuccess && (
        <Body accessibilityLiveRegion="polite">Profile saved.</Body>
      )}
      <Button
        label="Save profile"
        busy={save.isPending}
        onPress={() =>
          void handleSubmit((values) =>
            save.mutate({
              client_request_id: id.current,
              expected_version: profile.version,
              display_name: values.display_name.trim() || null,
              email: values.email.trim() || null,
            }),
          )()
        }
      />
    </Card>
  );
}
function PreferencesForm({
  preferences,
}: {
  preferences: CustomerPreferences;
}) {
  const owner = useCustomerOwner(),
    id = useRef(randomUUID()),
    [language, setLanguage] = useState(preferences.language),
    [notifications, setNotifications] = useState(
      preferences.collection_notifications,
    );
  const save = usePreparedSave(repositories.updatePreferences, [
    'preferences',
    owner,
  ]);
  return (
    <Card>
      <Heading style={{ fontSize: 26 }}>Language & updates</Heading>
      <Body>
        Choose your preferred language for service messages. App translations
        are pending approved content.
      </Body>
      {(['en-IN', 'hi-IN'] as const).map((code) => (
        <Pressable
          key={code}
          accessibilityRole="radio"
          accessibilityState={{ checked: language === code }}
          onPress={() => setLanguage(code)}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Body>
            {language === code ? '◉ ' : '○ '}
            {code === 'en-IN' ? 'English (India)' : 'Hindi (India)'}
          </Body>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: notifications }}
        onPress={() => setNotifications((value) => !value)}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Body>Collection notifications · {notifications ? 'On' : 'Off'}</Body>
      </Pressable>
      {save.isError && (
        <Body accessibilityRole="alert">{userMessage(save.error)}</Body>
      )}
      {save.isSuccess && (
        <Body accessibilityLiveRegion="polite">Preferences saved.</Body>
      )}
      <Button
        label="Save preferences"
        busy={save.isPending}
        onPress={() =>
          save.mutate({
            client_request_id: id.current,
            expected_version: preferences.version,
            language,
            collection_notifications: notifications,
          })
        }
      />
    </Card>
  );
}
function FavouritesForm({ favourites }: { favourites: FavouriteCategories }) {
  const catalogue = useCatalogue(),
    owner = useCustomerOwner(),
    id = useRef(randomUUID()),
    [codes, setCodes] = useState(favourites.category_codes);
  const save = usePreparedSave(repositories.updateFavourites, [
    'favourites',
    owner,
  ]);
  return (
    <Card>
      <Heading style={{ fontSize: 26 }}>Favourite collection items</Heading>
      {catalogue.isError && (
        <StatusCard
          title="Items unavailable"
          error={catalogue.error}
          retry={() => void catalogue.refetch()}
        />
      )}
      {catalogue.data?.categories
        .filter((item) => item.active)
        .map((item) => (
          <Pressable
            key={item.code}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: codes.includes(item.code) }}
            onPress={() =>
              setCodes((previous) =>
                previous.includes(item.code)
                  ? previous.filter((code) => code !== item.code)
                  : [...previous, item.code],
              )
            }
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Body>
              {codes.includes(item.code) ? '✓ ' : '○ '}
              {item.name}
            </Body>
          </Pressable>
        ))}
      {save.isError && (
        <Body accessibilityRole="alert">{userMessage(save.error)}</Body>
      )}
      {save.isSuccess && (
        <Body accessibilityLiveRegion="polite">Favourites saved.</Body>
      )}
      <Button
        label="Save favourites"
        busy={save.isPending}
        disabled={!catalogue.data}
        onPress={() =>
          save.mutate({
            client_request_id: id.current,
            expected_version: favourites.version,
            category_codes: codes,
          })
        }
      />
    </Card>
  );
}
function FeedbackForm() {
  const owner = useCustomerOwner(),
    id = useRef(randomUUID()),
    {
      control,
      handleSubmit,
      formState: { errors },
    } = useForm({ defaultValues: { message: '' } });
  const save = usePreparedSave(repositories.feedback, ['feedback', owner]);
  return (
    <Card>
      <Heading style={{ fontSize: 26 }}>Share feedback</Heading>
      <Body>
        Tell us how we can improve. Please leave out payment credentials and
        sensitive personal information.
      </Body>
      <Controller
        control={control}
        name="message"
        rules={{
          validate: (value) =>
            value.trim().length >= 5 || 'Please enter at least 5 characters.',
          maxLength: 2000,
        }}
        render={({ field }) => (
          <TextInput
            accessibilityLabel="Feedback message"
            value={field.value}
            onChangeText={field.onChange}
            style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
            multiline
            maxLength={2000}
          />
        )}
      />
      {errors.message && (
        <Body accessibilityRole="alert">{errors.message.message}</Body>
      )}
      {save.isError && (
        <Body accessibilityRole="alert">{userMessage(save.error)}</Body>
      )}
      {save.isSuccess && (
        <Body accessibilityLiveRegion="polite">
          Thank you. Your feedback was received.
        </Body>
      )}
      <Button
        label="Send feedback"
        busy={save.isPending}
        disabled={save.isSuccess}
        onPress={() =>
          void handleSubmit((values) =>
            save.mutate({
              client_request_id: id.current,
              message: values.message.trim(),
            }),
          )()
        }
      />
    </Card>
  );
}
export default function AccountOptionsScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>(),
    owner = useCustomerOwner();
  const profile = useQuery({
    queryKey: ['profile', owner],
    queryFn: ({ signal }) => repositories.profile(signal),
    enabled: section === 'profile',
  });
  const preferences = useQuery({
    queryKey: ['preferences', owner],
    queryFn: ({ signal }) => repositories.preferences(signal),
    enabled: section === 'preferences',
  });
  const favourites = useQuery({
    queryKey: ['favourites', owner],
    queryFn: ({ signal }) => repositories.favourites(signal),
    enabled: section === 'favourites',
  });
  const methods = useQuery({
    queryKey: ['paymentMethods', owner],
    queryFn: ({ signal }) => repositories.paymentMethods(signal),
    enabled: section === 'paymentMethods',
  });
  const query =
    section === 'profile'
      ? profile
      : section === 'preferences'
        ? preferences
        : section === 'favourites'
          ? favourites
          : section === 'paymentMethods'
            ? methods
            : null;
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Header back address={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <Heading>Account</Heading>
        {query?.isPending && <Skeleton height={170} />}
        {query?.isError && (
          <StatusCard
            title="This account information is unavailable"
            error={query.error}
            retry={() => void query.refetch()}
          />
        )}
        {section === 'profile' && profile.data && (
          <ProfileForm key={profile.data.version} profile={profile.data} />
        )}
        {section === 'preferences' && preferences.data && (
          <PreferencesForm
            key={preferences.data.version}
            preferences={preferences.data}
          />
        )}
        {section === 'favourites' && favourites.data && (
          <FavouritesForm
            key={favourites.data.version}
            favourites={favourites.data}
          />
        )}
        {section === 'paymentMethods' && methods.data && (
          <Card>
            <Heading style={{ fontSize: 26 }}>Payment methods</Heading>
            <Body>
              Available options are confirmed in secure checkout. Tirodhan does
              not store your card details.
            </Body>
            {methods.data.methods.map((method) => (
              <View key={method.code} style={{ paddingVertical: 12 }}>
                <Heading style={{ fontSize: 23 }}>{method.label}</Heading>
                <Body>{method.description}</Body>
              </View>
            ))}
            {!methods.data.methods.length && (
              <Body>No payment methods are available yet.</Body>
            )}
          </Card>
        )}
        {section === 'feedback' && <FeedbackForm />}
        {![
          'profile',
          'preferences',
          'favourites',
          'paymentMethods',
          'feedback',
        ].includes(section ?? '') && (
          <Body style={{ color: colors.error }}>
            This account option is not available.
          </Body>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
