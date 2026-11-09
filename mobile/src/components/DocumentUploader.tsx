// Worker uploads NRC front, NRC back and a selfie for verification.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Button, colors, ErrorText, Muted, Row } from './ui';
import { api, apiUpload, errorMessage } from '@/lib/api';
import type { WorkerDocument } from '@/lib/types';

const HINTS: Record<WorkerDocument['kind'], string> = {
  nrc_front: 'Front of your NRC, flat and in good light',
  nrc_back: 'Back of your NRC',
  selfie: 'A clear photo of your face, no hat or sunglasses',
};

export function DocumentUploader({ onChange }: { onChange?: (docs: WorkerDocument[]) => void }) {
  const [docs, setDocs] = useState<WorkerDocument[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const update = useCallback(
    (d: WorkerDocument[]) => {
      setDocs(d);
      onChange?.(d);
    },
    [onChange]
  );

  useEffect(() => {
    api<{ documents: WorkerDocument[] }>('/workers/me/documents')
      .then((r) => update(r.documents))
      .catch((e) => setError(errorMessage(e)));
  }, [update]);

  async function pick(kind: WorkerDocument['kind'], source: 'camera' | 'library') {
    setError('');
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(source === 'camera' ? 'Allow camera access to take the photo.' : 'Allow photo access to choose a picture.');
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.6, // keeps photos well under the 5 MB limit
        allowsEditing: kind !== 'selfie',
        cameraType: kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      };
      const result =
        source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setBusy(kind);
      const form = new FormData();
      const name = asset.fileName ?? `${kind}.jpg`;
      if (Platform.OS === 'web') {
        form.append('photo', await (await fetch(asset.uri)).blob(), name);
      } else {
        // React Native's FormData takes a { uri, name, type } object for files.
        form.append('photo', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      }
      const r = await apiUpload<{ documents: WorkerDocument[] }>(`/workers/me/documents/${kind}`, form);
      update(r.documents);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const done = docs.filter((d) => d.uploaded).length;

  return (
    <View style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Your photos</Text>
        <Badge tone={done === 3 ? 'success' : 'warn'} label={`${done} of 3 uploaded`} />
      </Row>
      {docs.map((d) => (
        <Row key={d.kind} style={{ alignItems: 'flex-start' }}>
          <View
            style={{
              width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6',
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
            }}
          >
            {busy === d.kind ? (
              <ActivityIndicator color={colors.primary} />
            ) : d.url ? (
              <Image source={{ uri: d.url }} style={{ width: 72, height: 72 }} />
            ) : (
              <Text style={{ fontSize: 26 }}>{d.kind === 'selfie' ? '🙂' : '🪪'}</Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {d.label} {d.uploaded ? '✓' : ''}
            </Text>
            <Muted style={{ fontSize: 12 }}>{HINTS[d.kind]}</Muted>
            <Row>
              <Button
                title={d.uploaded ? 'Retake' : 'Take photo'}
                variant="secondary"
                style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                onPress={() => pick(d.kind, 'camera')}
                disabled={!!busy}
              />
              {d.kind !== 'selfie' && (
                <Pressable onPress={() => pick(d.kind, 'library')} disabled={!!busy} hitSlop={6}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>Choose photo</Text>
                </Pressable>
              )}
            </Row>
          </View>
        </Row>
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
