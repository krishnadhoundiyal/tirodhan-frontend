import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { JourneyDto } from '../../api/customer-contracts';
import { Body, Heading } from '../../components/ui';
import { colors } from '../../theme/tokens';
import MediaImage from '../media/MediaImage';
import type { Media } from '../media/model';
const icons = {
  BOOKED: 'calendar-outline',
  COLLECTED: 'bicycle-outline',
  RECEIVED: 'business-outline',
  HANDOVER_VALIDATED: 'checkmark-circle-outline',
} as const;
export default function JourneyTimeline({
  journey,
  artwork,
}: {
  journey: JourneyDto;
  artwork?: {
    home: Media | null;
    rickshaw: Media | null;
    receiving_point: Media | null;
  };
}) {
  return (
    <View style={{ gap: 14 }}>
      <Heading style={{ fontSize: 26 }}>Journey of your sacred items</Heading>
      {journey.milestones.map((step) => (
        <View
          key={step.code}
          accessibilityLabel={`${step.label}, ${step.state === 'COMPLETE' ? 'completed' : step.state === 'CURRENT' ? 'current step' : 'upcoming'}`}
          style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
        >
          <View
            style={{
              backgroundColor:
                step.state === 'COMPLETE' ? colors.gold : colors.tint,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icons[step.code]} size={23} color={colors.text} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Heading style={{ fontSize: 22, lineHeight: 25, marginBottom: 0 }}>
              {step.label}
            </Heading>
            <Body>
              {step.state === 'COMPLETE'
                ? step.occurred_at
                  ? new Date(step.occurred_at).toLocaleString('en-IN')
                  : 'Completed'
                : step.state === 'CURRENT'
                  ? 'Current step'
                  : 'Upcoming'}
            </Body>
            {step.detail && <Body>{step.detail}</Body>}
          </View>
          {step.code === 'COLLECTED' && (step.image || artwork?.rickshaw) && (
            <MediaImage
              media={step.image ?? artwork?.rickshaw ?? null}
              fit="contain"
              fallback="bicycle-outline"
              style={{ width: 72, height: 55, borderRadius: 8 }}
            />
          )}
        </View>
      ))}
      {journey.receiving_point && (
        <View
          style={{
            borderTopWidth: 1,
            borderColor: colors.border,
            paddingTop: 12,
            gap: 5,
          }}
        >
          <Heading style={{ fontSize: 23 }}>Authorised receiving point</Heading>
          <Body style={{ color: colors.text }}>
            {journey.receiving_point.name}
          </Body>
          <Body>{journey.receiving_point.authority_label}</Body>
          <Body>{journey.receiving_point.address_summary}</Body>
          {journey.receiving_point.image && (
            <MediaImage
              media={journey.receiving_point.image}
              style={{ width: '100%', height: 140, borderRadius: 12 }}
            />
          )}
        </View>
      )}
      {journey.handover.state === 'VALIDATED' && (
        <Body accessibilityLiveRegion="polite">
          Handover validated by Tirodhan. Further processing is shown only when
          confirmed by the service.
        </Body>
      )}
    </View>
  );
}
