import { useEffect, useRef, useState } from 'react';
import { AdminButton } from '@/shared/ui/admin/AdminLayout';
import { AdminFieldLabel, AdminSelect } from '@/shared/ui/admin/AdminFormControls';
import { listAudioDevices, selectAudioOutput, type AudioDevice } from '../application/audio-devices';
import { pbxRequest } from '../application/pbx-request';

export function UnionPbxAudioDevices({ locked, microphoneId, onMicrophone, onOutputPending, getAudio }: {
  locked: boolean; microphoneId: string; onMicrophone: (id: string) => void; onOutputPending: (pending: boolean) => void; getAudio: () => HTMLAudioElement | null;
}) {
  const [inputs, setInputs] = useState<AudioDevice[]>([]), [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [outputId, setOutputId] = useState(''), [busy, setBusy] = useState(false);
  const [nativePending, setNativePending] = useState(false);
  const [notice, setNotice] = useState('Atualize a lista para escolher os dispositivos. A permissão de microfone é solicitada ao iniciar ou atender uma ligação.');
  const [supportsOutput, setSupportsOutput] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const nativeOutputPending = useRef(false);
  useEffect(() => {
    setSupportsOutput(typeof getAudio()?.setSinkId === 'function');
    return () => { controllerRef.current?.abort(); onOutputPending(false); };
  }, []);

  const refresh = async () => {
    if (locked || busy || nativeOutputPending.current) return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true);
    try {
      const devices = await pbxRequest(() => listAudioDevices(navigator.mediaDevices), 'Lista de dispositivos', { signal: controller.signal });
      if (controller.signal.aborted) return;
      setInputs(devices.inputs); setOutputs(devices.outputs);
      if (microphoneId && !devices.inputs.some(device => device.id === microphoneId)) onMicrophone('');
      setNotice('Dispositivos atualizados. Se os nomes estiverem ocultos, autorize o microfone numa ligação e atualize novamente. Microfones selecionados serão usados na próxima chamada.');
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : 'Falha ao listar dispositivos.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  const chooseOutput = async (id: string) => {
    if (locked || busy || nativeOutputPending.current || (id && !outputs.some(device => device.id === id))) return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true);
    // This browser API cannot be aborted. Keep the operation locked until its
    // native promise settles, even if the visible confirmation times out.
    const operation = selectAudioOutput(getAudio(), id, {
      pending: value => {
        nativeOutputPending.current = value;
        if (!controller.signal.aborted) { setNativePending(value); onOutputPending(value); }
      },
      confirmed: value => {
        if (!controller.signal.aborted) { setOutputId(value); setNotice('Saída de áudio confirmada.'); }
      },
    });
    try {
      await pbxRequest(() => operation, 'Seleção da saída de áudio', { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) setNotice(`${error instanceof Error ? error.message : 'Não foi possível selecionar a saída.'} Se a confirmação continuar pendente, recarregue esta aba antes de ligar.`);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Dispositivos de áudio">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Dispositivos de áudio</h2>
      <AdminButton variant="secondary" size="sm" onClick={() => void refresh()} disabled={locked || busy || nativePending}>Atualizar dispositivos</AdminButton></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><AdminFieldLabel label="Microfone" /><AdminSelect ariaLabel="Microfone da chamada" value={microphoneId} disabled={locked || busy || nativePending}
        onValueChange={id => { if (!locked && !nativeOutputPending.current && (!id || inputs.some(device => device.id === id))) onMicrophone(id); }}
        options={[{ value: '', label: 'Padrão do sistema' }, ...inputs.map(device => ({ value: device.id, label: device.label }))]} /></div>
      <div><AdminFieldLabel label="Saída de áudio" /><AdminSelect ariaLabel="Saída de áudio da chamada" value={outputId} disabled={locked || busy || nativePending || !supportsOutput}
        onValueChange={id => void chooseOutput(id)} options={[{ value: '', label: 'Padrão do sistema' }, ...outputs.map(device => ({ value: device.id, label: device.label }))]} /></div>
    </div>
    {!supportsOutput && <p className="text-xs text-muted-foreground">Este navegador usa a saída de áudio definida nas configurações do sistema.</p>}
    <p role="status" className="text-xs leading-5 text-muted-foreground">{locked ? 'Encerre a chamada para alterar os dispositivos. ' : ''}{notice}</p>
  </section>;
}
