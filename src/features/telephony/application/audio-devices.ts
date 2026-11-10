export type AudioDevice = { id: string; label: string };
export function microphoneConstraints(deviceId: string): MediaStreamConstraints {
  return { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false };
}

export async function listAudioDevices(mediaDevices?: Pick<MediaDevices, 'enumerateDevices'>) {
  if (!mediaDevices?.enumerateDevices) throw new Error('Este navegador não permite listar dispositivos de áudio.');
  const devices = await mediaDevices.enumerateDevices();
  const inputs: AudioDevice[] = [], outputs: AudioDevice[] = [], seen = new Set<string>();
  for (const device of devices) {
    if (!device.deviceId || !['audioinput', 'audiooutput'].includes(device.kind)) continue;
    const key = `${device.kind}:${device.deviceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const target = device.kind === 'audioinput' ? inputs : outputs;
    target.push({ id: device.deviceId, label: device.label || `${device.kind === 'audioinput' ? 'Microfone' : 'Saída de áudio'} ${target.length + 1}` });
  }
  return { inputs, outputs };
}

export async function selectAudioOutput(element: { setSinkId?: (id: string) => Promise<void> } | null, id: string,
  hooks?: { pending: (value: boolean) => void; confirmed: (id: string) => void }) {
  hooks?.pending(true);
  try {
    if (!element?.setSinkId) throw new Error('Este navegador usa a saída de áudio definida no sistema.');
    await element.setSinkId(id);
    hooks?.confirmed(id);
  } finally { hooks?.pending(false); }
}
