import { ActionModal } from '../../components/ActionModal';
import { Body, Button } from '../../components/ui';
export default function DistanceConfirmation({
  distance,
  confirm,
  chooseAnother,
}: {
  distance: number | null;
  confirm(): void;
  chooseAnother(): void;
}) {
  return (
    <ActionModal
      visible={distance !== null}
      title="Confirm pickup location"
      close={chooseAnother}
    >
      <Body>
        This pickup address is approximately {Math.round(distance ?? 0)} km from
        your current location.
      </Body>
      <Body>
        This is an approximate straight-line distance. Please confirm that this
        is the pickup location you want.
      </Body>
      <Button label="Use this address" onPress={confirm} />
      <Button secondary label="Choose another" onPress={chooseAnother} />
    </ActionModal>
  );
}
