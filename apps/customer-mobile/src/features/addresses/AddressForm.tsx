import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Address, AddressWrite, Location } from '../../api/contracts';
import type { PreparedCommand } from '../../api/transport';
import { repositories as api } from '../../lib/repositories';
import {
  Body,
  Button,
  Card,
  Heading,
  TextAction,
  styles,
} from '../../components/ui';
import { colors } from '../../theme/tokens';
import { ApiError, userMessage } from '../../api/errors';
export default function AddressForm({
  existing,
  initialAddress,
  location,
  onDone,
}: {
  existing?: Address;
  initialAddress: string;
  location: Location | null;
  onDone: (address?: Address, archived?: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<AddressWrite>({
    defaultValues: {
      address: existing?.address ?? initialAddress,
      label: existing?.label ?? 'Home',
      is_default: existing?.is_default ?? false,
      location: existing?.location ?? location,
    },
  });
  const prepared = useRef<{
    fingerprint: string;
    command: PreparedCommand<Address>;
  } | null>(null);
  const archive = useRef<PreparedCommand<Address> | null>(null);
  const [error, setError] = useState<string>();
  const [archiving, setArchiving] = useState(false);
  const save = async (values: AddressWrite) => {
    setError(undefined);
    const body = {
      ...values,
      address: values.address.trim(),
      label: values.label?.trim() || null,
    };
    const fingerprint = JSON.stringify(body);
    if (prepared.current?.fingerprint !== fingerprint)
      prepared.current = {
        fingerprint,
        command: existing
          ? api.updateAddress(existing.address_id, {
              ...body,
              expected_version: existing.version,
            })
          : api.createAddress(body),
      };
    try {
      const saved = await prepared.current.command.execute();
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onDone(saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['addresses'] });
        setError(
          'This address changed. Close this form and reopen the latest address to edit it.',
        );
      } else setError(userMessage(error));
    }
  };
  const remove = async () => {
    if (!existing || archiving || isSubmitting) return;
    setArchiving(true);
    archive.current ??= api.archiveAddress(existing.address_id);
    try {
      await archive.current.execute();
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onDone(undefined, true);
    } catch (error) {
      setError(userMessage(error));
    } finally {
      setArchiving(false);
    }
  };
  return (
    <Card>
      <Heading style={{ fontSize: 27 }}>
        {existing ? 'Edit address' : 'Add new address'}
      </Heading>
      <Body>Address label</Body>
      <Controller
        control={control}
        name="label"
        rules={{ maxLength: 80 }}
        render={({ field }) => (
          <TextInput
            accessibilityLabel="Address label"
            style={styles.input}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            placeholder="Home, Temple, Other"
            maxLength={80}
          />
        )}
      />
      <Body>Complete pickup address</Body>
      <Controller
        control={control}
        name="address"
        rules={{
          validate: (value) =>
            value.trim().length > 0 || 'Please enter your pickup address.',
          maxLength: 2000,
        }}
        render={({ field }) => (
          <TextInput
            accessibilityLabel="Complete pickup address"
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            value={field.value}
            onChangeText={field.onChange}
            multiline
            maxLength={2000}
          />
        )}
      />
      {errors.address && (
        <Body style={{ color: colors.error }}>{errors.address.message}</Body>
      )}
      <Controller
        control={control}
        name="is_default"
        render={({ field }) => (
          <TextAction
            label={
              field.value
                ? '✓ Default pickup address'
                : 'Set as default pickup address'
            }
            onPress={() => field.onChange(!field.value)}
          />
        )}
      />
      {error && (
        <Body accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Body>
      )}
      <Button
        label="Save address"
        busy={isSubmitting}
        disabled={archiving}
        onPress={() => void handleSubmit(save)()}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextAction label="Cancel" onPress={() => onDone()} />
        {existing && (
          <TextAction
            label={archiving ? 'Archiving…' : 'Archive address'}
            onPress={() => void remove()}
          />
        )}
      </View>
    </Card>
  );
}
