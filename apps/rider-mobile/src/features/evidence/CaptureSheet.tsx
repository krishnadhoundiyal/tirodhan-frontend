import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import { Body, Button, Card, ErrorState, Muted } from '../../ui';
import { ApiError } from '../../api/errors';
import { mediaLimit } from './vault';
export default function CaptureSheet({
  kind,
  onCapture,
  onScan,
  onClose,
}: {
  kind: 'PHOTO' | 'VIDEO' | 'SCAN';
  onCapture(uri: string, time: string): Promise<void>;
  onScan(value: string): void;
  onClose(): void;
}) {
  const [permission, request] = useCameraPermissions(),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const camera = useRef<CameraView>(null),
    alive = useRef(true),
    locked = useRef(false);
  const stopRecording = useCallback(() => camera.current?.stopRecording(), []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (value) => {
      if (value !== 'active') {
        alive.current = false;
        stopRecording();
        onClose();
      }
    });
    return () => {
      alive.current = false;
      stopRecording();
      sub.remove();
    };
  }, [onClose, stopRecording]);
  const take = async () => {
    if (locked.current || !ready || !alive.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    let uri: string | undefined;
    try {
      const capturedAt = new Date().toISOString();
      const result =
        kind === 'VIDEO'
          ? await camera.current?.recordAsync({
              maxDuration: 15,
              maxFileSize: mediaLimit,
            })
          : await camera.current?.takePictureAsync({
              quality: 0.65,
              exif: false,
            });
      uri = result?.uri;
      if (!uri) throw new ApiError(0, 'configuration');
      if (!alive.current) throw new ApiError(0, 'cancelled');
      await onCapture(uri, capturedAt);
      uri = undefined;
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current)
        setError(e instanceof ApiError ? e : new ApiError(0, 'configuration'));
    } finally {
      if (uri?.startsWith(Paths.cache.uri)) {
        const f = new File(uri);
        if (f.exists) f.delete();
      }
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Modal visible onRequestClose={onClose} animationType="slide">
      <View style={{ flex: 1, padding: 24, gap: 16 }}>
        <Body>
          {kind === 'SCAN'
            ? 'Scan the actual managed label'
            : 'Capture field evidence'}
        </Body>
        {!permission?.granted ? (
          <Card>
            <Muted>
              Camera access is required for a new field capture or scan.
            </Muted>
            <Button
              title="Allow camera"
              onPress={() =>
                void request().catch(() =>
                  setError(new ApiError(0, 'configuration')),
                )
              }
            />
          </Card>
        ) : (
          <CameraView
            ref={camera}
            style={{ flex: 1, minHeight: 280 }}
            facing="back"
            mode={kind === 'VIDEO' ? 'video' : 'picture'}
            mute
            videoQuality="480p"
            onCameraReady={() => setReady(true)}
            onMountError={() => setError(new ApiError(0, 'configuration'))}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'datamatrix'],
            }}
            onBarcodeScanned={
              kind === 'SCAN'
                ? ({ data }) => {
                    if (!locked.current && alive.current) {
                      locked.current = true;
                      onScan(data);
                      onClose();
                    }
                  }
                : undefined
            }
          />
        )}
        <ErrorState error={error} />
        {kind !== 'SCAN' && (
          <Button
            title={
              busy
                ? 'Capturing…'
                : kind === 'VIDEO'
                  ? 'Record muted video (up to 15 seconds)'
                  : 'Take evidence photo'
            }
            disabled={!permission?.granted || !ready || busy}
            onPress={() => void take()}
          />
        )}
        {busy && kind === 'VIDEO' && (
          <Button
            title="Stop recording"
            onPress={() => camera.current?.stopRecording()}
          />
        )}
        <Button
          title="Cancel camera"
          onPress={() => {
            alive.current = false;
            camera.current?.stopRecording();
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}
