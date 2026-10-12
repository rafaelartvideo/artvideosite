/**
 * Contrato interno dos futuros emissores. Nenhum adaptador de transmissao
 * e configurado na Etapa 1. Nao importar credenciais para o frontend.
 */
export type NfseTransmissionResult = {
  providerReference: string;
  state: "processing" | "authorized" | "rejected";
  originalResponse: unknown;
};

export interface NfseProviderAdapter {
  readonly key: string;
  validateConfiguration(organizationId: string): Promise<{ valid: boolean; errors: string[] }>;
  transmitDraft(draftId: string, idempotencyKey: string): Promise<NfseTransmissionResult>;
  queryStatus(providerReference: string): Promise<NfseTransmissionResult>;
  cancel(providerReference: string, reason: string): Promise<NfseTransmissionResult>;
}

/** Bloqueio proposital: a emissao real so sera desenvolvida apos homologacao. */
export const NFSE_LIVE_EMISSION_ENABLED = false as const;
export function assertNfseTransmissionAvailable(): never {
  throw new Error("A emissao real de NFS-e esta desativada. Nenhum provedor fiscal foi homologado.");
}
