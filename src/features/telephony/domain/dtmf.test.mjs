import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import RTCSession from 'jssip/lib/RTCSession.js';

async function load() {
  const path = 'src/features/telephony/application/dtmf.ts';
  const { code } = await transformWithEsbuild(readFileSync(path, 'utf8'), path, { loader: 'ts' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function session() {
  const state = { sent: [], terminated: 0 };
  return { state, isEstablished: () => true,
    connection: { getSenders: () => [{ track: { kind: 'audio' }, dtmf: { canInsertDTMF: true, insertDTMF() {} } }] },
    sendDTMF(digit, options) { state.sent.push({ digit, options }); },
    terminate() { state.terminated++; },
  };
}

test('cada tecla válida envia um único DTMF RFC2833 à sessão existente sem encerrar', async () => {
  const { sendPbxDigit } = await load(); const sip = session();
  for (const digit of '123456789*0#') sendPbxDigit(sip, digit);
  assert.deepEqual(sip.state.sent, Array.from('123456789*0#', digit => ({ digit, options: { transportType: 'RFC2833' } })));
  assert.equal(sip.state.terminated, 0);
});

test('JsSIP 3.13.9 real encaminha RFC2833 ao RTCDTMFSender existente', async () => {
  const { sendPbxDigit } = await load(); const inserted = [];
  const sip = Object.create(RTCSession.prototype);
  sip._status = RTCSession.C.STATUS_CONFIRMED;
  sip._connection = { getSenders: () => [{ track: { kind: 'audio' }, dtmf: { canInsertDTMF: true, toneBuffer: '', insertDTMF: (...args) => inserted.push(args) } }] };
  sip.terminate = () => assert.fail('não deve terminar a sessão');
  sendPbxDigit(sip, '5');
  assert.equal(inserted.length, 1); assert.equal(inserted[0][0], '5');
  assert.equal(inserted[0][1], 100); assert.equal(inserted[0][2], 500);
});

test('sem sender de áudio RTP e capacidade DTMF não há envio nem fallback INFO', async () => {
  const { sendPbxDigit } = await load();
  for (const connection of [undefined, {}, { getSenders: () => [] }, { getSenders: () => [{ track: { kind: 'video' }, dtmf: { canInsertDTMF: true, insertDTMF() {} } }] }, { getSenders: () => [{ track: { kind: 'audio' }, dtmf: null }] }, { getSenders: () => [{ track: { kind: 'audio' }, dtmf: { canInsertDTMF: false, insertDTMF() {} } }] }]) {
    const sip = session(); sip.connection = connection;
    assert.throws(() => sendPbxDigit(sip, '5'), /navegador|teclado|disponível/i);
    assert.equal(sip.state.sent.length, 0); assert.equal(sip.state.terminated, 0);
  }
});

test('rejeita sequências, coerção, espaço, teclas inválidas e quebras de linha sem envio', async () => {
  const { sendPbxDigit } = await load(); const sip = session();
  for (const digit of ['', '12', '*#', ' 1', '1 ', '1\n', '1\r\n', 'A', 'a', '９', 1, null, undefined, {}, ['1']]) {
    assert.throws(() => sendPbxDigit(sip, digit), /tecla|dígito/i);
  }
  assert.equal(sip.state.sent.length, 0); assert.equal(sip.state.terminated, 0);
});

test('sessão ausente, não estabelecida ou sem método não envia nem encerra', async () => {
  const { sendPbxDigit } = await load(); const sip = session(); sip.isEstablished = () => false;
  for (const candidate of [null, undefined, {}, sip, { isEstablished: () => true }, { isEstablished: true, sendDTMF() {} }]) {
    assert.throws(() => sendPbxDigit(candidate, '1'), /chamada|tecla|disponível/i);
  }
  assert.equal(sip.state.sent.length, 0); assert.equal(sip.state.terminated, 0);
});

test('falha síncrona do envio é traduzida e não termina a chamada', async () => {
  const { sendPbxDigit } = await load(); const sip = session();
  sip.sendDTMF = () => { throw new Error('INVALID_STATE_ERROR'); };
  assert.throws(() => sendPbxDigit(sip, '#'), /Não foi possível enviar a tecla/);
  assert.equal(sip.state.terminated, 0);
});

async function loadPad() {
  const path = 'src/features/telephony/presentation/UnionPbxDtmfPad.tsx';
  // Keep the real component's tree and event handlers; substitute only the CRM button primitive.
  const source = readFileSync(path, 'utf8').replace(/import \{ AdminButton \} from ['"]@\/shared\/ui\/admin\/AdminLayout['"];?/, "const AdminButton = 'button';");
  const { code } = await transformWithEsbuild(source, path, { loader: 'tsx', jsx: 'transform', jsxFactory: 'React.createElement' });
  return import(`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))};\n${code}`).toString('base64')}`);
}

function findButtons(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'button') return [node];
  return [node.props?.children].flat(Infinity).flatMap(findButtons);
}

test('teclado apresenta 12 teclas acessíveis em ordem e dispara somente a tecla escolhida', async () => {
  const { UnionPbxDtmfPad } = await loadPad(); const sent = [];
  const element = UnionPbxDtmfPad({ disabled: false, onDigit: digit => sent.push(digit) });
  const buttons = findButtons(element);
  assert.equal(buttons.length, 12);
  assert.deepEqual(buttons.map(button => button.props.children), Array.from('123456789*0#'));
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.props['aria-label'], `Enviar tecla ${'123456789*0#'[index]}`);
    assert.equal(button.props.type, 'button'); assert.equal(button.props.disabled, false);
  }
  buttons[11].props.onClick(); assert.deepEqual(sent, ['#']);
  const html = renderToStaticMarkup(createElement(UnionPbxDtmfPad, { disabled: false, onDigit() {} }));
  assert.match(html, /Teclado/); assert.match(html, /grid-cols-3/);
});

test('teclado desabilitado mantém todas as teclas bloqueadas e não chama onDigit', async () => {
  const { UnionPbxDtmfPad } = await loadPad(); const sent = [];
  const buttons = findButtons(UnionPbxDtmfPad({ disabled: true, onDigit: digit => sent.push(digit) }));
  assert.equal(buttons.length, 12);
  for (const button of buttons) { assert.equal(button.props.disabled, true); button.props.onClick(); }
  assert.deepEqual(sent, []);
  const html = renderToStaticMarkup(createElement(UnionPbxDtmfPad, { disabled: true, onDigit() {} }));
  assert.equal((html.match(/ disabled=""/g) || []).length, 12);
});

test('telefone completo e flutuante compartilham handler e bloqueio de DTMF', async () => {
  const path = 'src/features/telephony/presentation/UnionPbxToolPage.tsx';
  const page = readFileSync(path, 'utf8');
  assert.equal((page.match(/<UnionPbxDtmfPad disabled=\{dtmfDisabled\} onDigit=\{sendDigit\}/g) || []).length, 1);
  assert.match(page, /if \(callState === "active"\) sendDigit\(digit\)/);
  assert.match(page, /type SipSession = CallControlSession & PbxDigitSession/);
  assert.match(page, /const dtmfDisabled = callState !== 'active' \|\| held \|\| holdUncertain \|\| transferUncertain \|\| Boolean\(controlBusy\)/);
  assert.match(page, /max-h-\[calc\(100dvh-2rem-env\(safe-area-inset-bottom\)\)\][^"]*overflow-y-auto/, 'telefone flutuante com teclado deve caber em telas baixas');
  assert.ok((await transformWithEsbuild(page, path, { loader: 'tsx' })).code);
});

test('handler real do telefone impede DTMF em espera, incerteza, negociação e sessão encerrada', async () => {
  const path = 'src/features/telephony/presentation/UnionPbxToolPage.tsx';
  const page = readFileSync(path, 'utf8');
  const handler = page.match(/  const sendDigit = \(digit: string\) => \{[\s\S]*?\n  \};/);
  assert.ok(handler, 'handler compartilhado deve existir');
  const { code } = await transformWithEsbuild(`export function execute(input) {
    const { sessionRef, callState, held, holdUncertain, transferUncertain, controlBusy, controlLockRef, transferUncertainRef, sendPbxDigit, setNotice } = input;
    ${handler[0]}
    sendDigit('5');
  }`, 'dtmf-phone-handler.ts', { loader: 'ts' });
  const { execute } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const calls = [], notices = [];
  const normal = { sessionRef: { current: { isEstablished: () => true } }, callState: 'active', held: false, holdUncertain: false, transferUncertain: false, controlBusy: null, controlLockRef: { current: false }, transferUncertainRef: { current: false }, sendPbxDigit: (...args) => calls.push(args), setNotice: notice => notices.push(notice) };
  for (const overrides of [{ callState: 'incoming' }, { callState: 'idle' }, { held: true }, { holdUncertain: true }, { transferUncertain: true }, { controlBusy: 'hold' }, { controlBusy: 'transfer' }, { controlLockRef: { current: true } }, { transferUncertainRef: { current: true } }, { sessionRef: { current: null } }, { sessionRef: { current: { isEstablished: () => false } } }]) execute({ ...normal, ...overrides });
  assert.equal(calls.length, 0);
  execute(normal); assert.deepEqual(calls, [[normal.sessionRef.current, '5']]);
  execute({ ...normal, sendPbxDigit: () => { throw new Error('Teclado indisponível.'); } });
  assert.equal(notices.at(-1), 'Teclado indisponível.');
});

test('discador numérico mantém 12 posições mas impede símbolos antes da ligação', async () => {
  const { UnionPbxDtmfPad } = await loadPad();
  const entered = [];
  const buttons = findButtons(UnionPbxDtmfPad({
    disabled: false, title: 'Teclado de discagem', allowSymbols: false,
    onDigit: digit => entered.push(digit),
  }));
  assert.equal(buttons.length, 12);
  assert.equal(buttons[9].props.disabled, true);
  assert.equal(buttons[11].props.disabled, true);
  buttons[0].props.onClick(); buttons[9].props.onClick(); buttons[10].props.onClick();
  assert.deepEqual(entered, ['1', '0']);
});
