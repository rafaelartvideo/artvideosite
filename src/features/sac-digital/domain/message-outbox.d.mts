import type { SacDigitalMessage } from '../infrastructure/sac-digital.repository';
export type MessageContext = { organizationId: string; userId: string; protocolId: string; externalProtocolId?: string; senderName?: string | null };
export type OutboxEntry = { id: string; context: MessageContext; text: string; file: File | null; state: 'queued' | 'sending' | 'accepted' | 'unknown' | 'failed'; error: string; message: SacDigitalMessage; done: Promise<OutboxEntry> };
export class SacMessageOutbox {
  constructor(options?: { createId?: () => string; now?: () => string; onChange?: () => void });
  onChange: () => void;
  composer(context: MessageContext): { text: string; file: File | null };
  compose(context: MessageContext, changes: { text?: string; file?: File | null }): void;
  send(context: MessageContext, transport: (entry: OutboxEntry) => Promise<Record<string, unknown>>): OutboxEntry | null;
  visible(context: MessageContext, messages: SacDigitalMessage[]): SacDigitalMessage[];
  canRestore(context: MessageContext, id: string): boolean;
  restore(context: MessageContext, id: string): boolean;
}
