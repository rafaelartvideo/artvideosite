/** Contrato do painel interno: todas as etapas compartilham o mesmo AdminDialog. */
export type WhatsAppSettingsInlinePane = {
  key: string;
  title: string;
  description?: string;
  compact?: boolean;
};
export type WhatsAppSettingsInlinePaneChange = (
  pane: WhatsAppSettingsInlinePane | null,
  back?: () => void,
) => void;
