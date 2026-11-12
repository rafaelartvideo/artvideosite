import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithEsbuild } from 'vite';
async function load() {
  const path = 'src/features/telephony/application/audio-devices.ts';
  assert.ok(existsSync(path), 'adaptador de dispositivos deve existir');
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('padrão preserva captura atual e escolha explícita limita somente o microfone', async () => {
  const { microphoneConstraints } = await load();
  assert.deepEqual(microphoneConstraints(''), { audio: true, video: false });
  assert.deepEqual(microphoneConstraints('realtek'), { audio: { deviceId: { exact: 'realtek' } }, video: false });
});

test('lista somente áudio, elimina duplicações e não pede acesso ao microfone', async () => {
  const { listAudioDevices } = await load();
  const result = await listAudioDevices({
    enumerateDevices: async () => [
      { kind: 'audioinput', deviceId: 'mic', label: 'Realtek' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Realtek' },
      { kind: 'audiooutput', deviceId: 'speaker', label: '' },
      { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
      { kind: 'audioinput', deviceId: '', label: '' },
    ],
    getUserMedia() { assert.fail('não deve capturar só para listar dispositivos'); },
  });
  assert.deepEqual(result.inputs, [{ id: 'mic', label: 'Realtek' }]);
  assert.deepEqual(result.outputs, [{ id: 'speaker', label: 'Saída de áudio 1' }]);
  await assert.rejects(listAudioDevices(undefined), /navegador/i);
});

test('seleção de saída usa o elemento da chamada e relata suporte ou falha sem esconder erro', async () => {
  const { selectAudioOutput } = await load();
  let selected;
  await selectAudioOutput({ setSinkId: async id => { selected = id; } }, 'speaker');
  assert.equal(selected, 'speaker');
  await assert.rejects(selectAudioOutput({}, 'speaker'), /navegador/i);
  await assert.rejects(selectAudioOutput({ setSinkId: async () => { throw new Error('denied'); } }, 'speaker'), /denied/);
});

test('confirmação nativa tardia mantém trava até o fim e reconcilia a saída após o prazo visual', async () => {
  const { selectAudioOutput } = await load();
  let finish;
  const events = [];
  const operation = selectAudioOutput({ setSinkId: () => new Promise(resolve => { finish = resolve; }) }, 'speaker', {
    pending: value => events.push(['pending', value]), confirmed: id => events.push(['confirmed', id]),
  });
  await Promise.race([operation, Promise.resolve('visible deadline')]);
  assert.deepEqual(events, [['pending', true]]);
  finish(); await operation;
  assert.deepEqual(events, [['pending', true], ['confirmed', 'speaker'], ['pending', false]]);
  const phone = readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8');
  assert.ok(phone.includes('outputPendingRef.current'));
  assert.ok(phone.includes('onOutputPending='));
});

test('seletores usam componentes compartilhados, travam durante chamada e alimentam a captura real', () => {
  const path = 'src/features/telephony/presentation/UnionPbxAudioDevices.tsx';
  assert.ok(existsSync(path));
  const ui = readFileSync(path, 'utf8');
  for (const item of ['AdminSelect', 'AdminButton', 'locked', 'AbortController', 'pbxRequest']) assert.ok(ui.includes(item), item);
  const phone = readFileSync('src/features/telephony/presentation/UnionPbxToolPage.tsx', 'utf8');
  // Echo, internal dialing, external dialing and answering must use the selected microphone.
  assert.equal((phone.match(/mediaConstraints: microphoneConstraints\(microphoneId\)/g) || []).length, 5, 'inclui retorno de chamada com microfone selecionado');
  assert.ok(phone.includes('locked={callState !== "idle"}'));
  assert.ok(phone.includes('getAudio={() => remoteAudioRef.current}'));
});
