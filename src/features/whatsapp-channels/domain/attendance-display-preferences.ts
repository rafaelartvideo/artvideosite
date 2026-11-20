/**
 * Preferências de visualização do próprio usuário no Atendimentos.
 * Não são permissões, não escrevem no banco e nunca alteram as preferências de outros operadores.
 * Escopo: empresa + usuário autenticado + navegador atual.
 */
export type AttendanceDisplayPreferences = {
  preserveUnreadOnView: boolean;
  markReadWhenAssuming: boolean;
  focusComposerOnOpen: boolean;
};
export const DEFAULT_ATTENDANCE_DISPLAY_PREFERENCES: Readonly<AttendanceDisplayPreferences> = Object.freeze({
  preserveUnreadOnView: false,
  markReadWhenAssuming: true,
  focusComposerOnOpen: true,
});
const PREFIX = "union-whatsapp-attendance-display:v1";
export const attendancePreferenceKey = (organizationId:string,userId:string) =>
  `${PREFIX}:${organizationId}:${userId}`;

export function readAttendanceDisplayPreferences(organizationId?:string|null,userId?:string|null):AttendanceDisplayPreferences {
  const fallback={...DEFAULT_ATTENDANCE_DISPLAY_PREFERENCES};
  if(!organizationId||!userId||typeof window==="undefined")return fallback;
  try {
    const raw=window.localStorage.getItem(attendancePreferenceKey(organizationId,userId));
    if(!raw)return fallback;
    const saved=JSON.parse(raw);
    if(!saved || typeof saved!=="object" || Array.isArray(saved))return fallback;
    return {
      preserveUnreadOnView:typeof saved.preserveUnreadOnView==="boolean"?saved.preserveUnreadOnView:fallback.preserveUnreadOnView,
      markReadWhenAssuming:typeof saved.markReadWhenAssuming==="boolean"?saved.markReadWhenAssuming:fallback.markReadWhenAssuming,
      focusComposerOnOpen:typeof saved.focusComposerOnOpen==="boolean"?saved.focusComposerOnOpen:fallback.focusComposerOnOpen,
    };
  } catch {return fallback;}
}
export function saveAttendanceDisplayPreferences(organizationId:string,userId:string,options:AttendanceDisplayPreferences) {
  if(!organizationId||!userId||typeof window==="undefined")return;
  try {window.localStorage.setItem(attendancePreferenceKey(organizationId,userId),JSON.stringify(options));}
  catch { /* Preferências continuam válidas nesta sessão se o armazenamento falhar. */ }
}
