import { deliveryState } from './resource-ui.mjs';
const lanes = new Map();
const scopeKey = ({ organizationId, userId, protocolId }) => JSON.stringify([organizationId, userId, protocolId]);
const laneKey = ({ organizationId, userId }) => JSON.stringify([organizationId, userId]);
const emptyComposer = () => ({ text: '', file: null });
const deliveryRank = { read: 4, delivered: 3, sent: 2, accepted: 1, queued: 0 };
function withDeliveryEvidence(previous, incoming) {
  if (!previous) return incoming;
  const before = deliveryState(previous.raw_metadata);
  const next = deliveryState(incoming.raw_metadata);
  if ((deliveryRank[before] || 0) > (deliveryRank[next] || 0)
    && (['read', 'delivered'].includes(before) || !['failed', 'rejected', 'deleted'].includes(next))) {
    return { ...incoming, raw_metadata: { ...incoming.raw_metadata, delivery_status: before } };
  }
  return incoming;
}

function failureState(error) {
  if (error?.outcome === 'rejected' || error?.outcome === 'failed') return 'failed';
  // Transport errors may happen after SAC accepted the operation. Never invite
  // another send unless the server explicitly rejected the original operation.
  return 'unknown';
}

function mediaType(file) {
  return file?.type?.startsWith('image/') ? 'image' : file?.type?.startsWith('audio/') ? 'audio'
    : file?.type?.startsWith('video/') ? 'video' : file ? 'file' : 'text';
}

export class SacMessageOutbox {
  constructor({ createId = () => crypto.randomUUID(), now = () => new Date().toISOString(), onChange = () => {} } = {}) {
    this.createId = createId;
    this.now = now;
    this.onChange = onChange;
    this.drafts = new Map();
    this.entries = new Map();
  }

  composer(context) { return this.drafts.get(scopeKey(context)) || emptyComposer(); }

  compose(context, changes) {
    this.drafts.set(scopeKey(context), { ...this.composer(context), ...changes });
    this.onChange();
  }

  send(context, transport) {
    const draft = this.composer(context);
    const text = draft.text.trim();
    if (!text && !draft.file) return null;
    const id = this.createId();
    const entry = {
      id, context: { ...context }, text, file: draft.file, state: 'queued', error: '',
      message: {
        id: `local:${id}`, protocol_id: context.protocolId, direction: 'outgoing',
        message_type: mediaType(draft.file), body_text: text || null, media_url: null,
        sender_name: context.senderName || null, sent_at: this.now(),
        raw_metadata: { sent_via_union: true, client_request_id: id, local_submission: 'queued', local_file_name: draft.file?.name || null },
      },
    };
    // Clearing this snapshot synchronously prevents Enter/click from consuming
    // the same draft twice, even before React has rendered the empty field.
    this.drafts.set(scopeKey(context), emptyComposer());
    this.entries.set(id, entry);
    this.onChange();
    const key = laneKey(context);
    const previous = lanes.get(key) || Promise.resolve();
    entry.done = previous.catch(() => {}).then(async () => {
      this.update(entry, 'sending');
      try {
        const response = await transport(entry);
        entry.localMessageId = response?.local_message_id || null;
        entry.externalMessageId = response?.external_message_id || null;
        entry.deliveryStatus = response?.delivery_status || 'accepted';
        this.update(entry, response?.outcome === 'unknown' ? 'unknown' : 'accepted');
      } catch (error) {
        entry.localMessageId = error?.local_message_id || null;
        entry.externalMessageId = error?.external_message_id || null;
        entry.error = error instanceof Error ? error.message : String(error || 'Não foi possível enviar.');
        this.update(entry, failureState(error));
      }
      return entry;
    });
    lanes.set(key, entry.done);
    void entry.done.then(() => { if (lanes.get(key) === entry.done) lanes.delete(key); });
    return entry;
  }

  update(entry, state) {
    entry.state = state;
    entry.message.raw_metadata = {
      ...entry.message.raw_metadata, local_submission: state,
      delivery_status: entry.deliveryStatus || state, local_error: entry.error,
    };
    this.onChange();
  }

  visible(context, rows) {
    const key = scopeKey(context);
    const result = new Map();
    const displayTimes = new Map();
    const clientIds = new Map();
    for (const row of rows) {
      if (row.protocol_id !== context.protocolId) continue;
      const clientId = row.raw_metadata?.client_request_id;
      const priorId = clientId && clientIds.get(clientId);
      if (priorId && priorId !== row.id) {
        result.set(priorId, { ...withDeliveryEvidence(result.get(priorId), row), id: priorId });
      } else {
        result.set(row.id, withDeliveryEvidence(result.get(row.id), row));
        if (clientId) clientIds.set(clientId, row.id);
      }
    }
    for (const entry of this.entries.values()) {
      if (scopeKey(entry.context) !== key) continue;
      const matched = [...result.values()].find(row =>
        row.raw_metadata?.client_request_id === entry.id
        || Boolean(entry.localMessageId && row.id === entry.localMessageId)
        || Boolean(entry.externalMessageId && (row.external_message_id === entry.externalMessageId
          || row.raw_metadata?.external_message_id === entry.externalMessageId)));
      if (matched) entry.confirmedMessage = withDeliveryEvidence(entry.confirmedMessage, matched);
      let message = entry.confirmedMessage || entry.message;
      if (entry.confirmedMessage) {
        const remoteState = deliveryState(entry.confirmedMessage.raw_metadata);
        const remoteFailed = ['failed', 'rejected'].includes(remoteState);
        const preliminary = !['accepted', 'sent', 'delivered', 'read', 'failed', 'rejected', 'deleted'].includes(remoteState);
        if (preliminary || (remoteFailed && !['queued', 'sending'].includes(entry.state))) {
          const localState = remoteFailed ? 'failed' : entry.state;
          message = { ...message, raw_metadata: {
            ...message.raw_metadata, client_request_id: entry.id,
            local_submission: localState, local_error: entry.error,
            local_file_name: entry.file?.name || null,
            ...(preliminary ? { delivery_status: entry.deliveryStatus || localState } : {}),
          } };
        }
      }
      result.set(message.id, message);
      displayTimes.set(message.id, entry.message.sent_at);
    }
    return [...result.values()].sort((a, b) => Date.parse(displayTimes.get(a.id) || a.sent_at) - Date.parse(displayTimes.get(b.id) || b.sent_at));
  }

  canRestore(context, id) {
    const entry = this.entries.get(id);
    const draft = this.composer(context);
    if (!entry || ['queued', 'sending'].includes(entry.state) || scopeKey(entry.context) !== scopeKey(context)
      || draft.text.trim() || draft.file) return false;
    return entry.confirmedMessage
      ? ['failed', 'rejected'].includes(deliveryState(entry.confirmedMessage.raw_metadata))
      : entry.state === 'failed';
  }

  restore(context, id) {
    if (!this.canRestore(context, id)) return false;
    const entry = this.entries.get(id);
    this.drafts.set(scopeKey(context), { text: entry.text, file: entry.file });
    this.entries.delete(id);
    this.onChange();
    return true;
  }
}
