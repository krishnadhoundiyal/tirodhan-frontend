import type { Location } from '../../api/contracts';
import { Card, Body } from '../../components/ui';
export default function MapPreview(_props: {
  location: Location | null;
  onSelect: (location: Location) => void;
}) {
  return (
    <Card>
      <Body>
        Map preview is available in the iOS and Android development builds.
      </Body>
    </Card>
  );
}
