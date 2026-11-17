/**
 * Sons do WhatsApp Union. Os arquivos ainda serão escolhidos pelo operador.
 * Ao receber os dois áudios, configurar somente os caminhos abaixo (arquivos
 * locais em public, sem chamadas ao Supabase nem à WuzAPI).
 */
export type UnionWhatsAppSoundKind="notification"|"conversation";
export const UNION_WHATSAPP_SOUND_ASSETS:Record<UnionWhatsAppSoundKind,string|null>={
  notification:null, // Aviso quando chega uma mensagem fora da conversa aberta.
  conversation:null, // Mensagem recebida na conversa que o operador está vendo.
};

const audioCache=new Map<UnionWhatsAppSoundKind,HTMLAudioElement>();
const seenMessages=new Set<string>();
const lastPlayedAt=new Map<UnionWhatsAppSoundKind,number>();

/**
 * Chamado apenas no evento Realtime INSERT recebido (nunca em consulta de
 * histórico). Deduplica eventos repetidos; limita o volume e a frequência.
 * Quando os arquivos forem adicionados, respeita o bloqueio de autoplay do
 * navegador sem disparar toast de erro ou nova requisição.
 */
export function playUnionWhatsAppSound(kind:UnionWhatsAppSoundKind,messageId:string):void{
  const url=UNION_WHATSAPP_SOUND_ASSETS[kind];
  if(!url || !messageId || typeof window==="undefined" || typeof Audio==="undefined" ||
    document.visibilityState!=="visible")return;
  const key=kind+":"+messageId;
  if(seenMessages.has(key))return;
  seenMessages.add(key);
  if(seenMessages.size>400)seenMessages.clear();
  const now=Date.now();
  if(now-(lastPlayedAt.get(kind)||0)<900)return;
  lastPlayedAt.set(kind,now);
  try{
    let audio=audioCache.get(kind);
    if(!audio || audio.src!==new URL(url,window.location.origin).href){
      audio=new Audio(url);
      audio.preload="auto";
      audio.volume=kind==="notification"?0.4:0.3;
      audioCache.set(kind,audio);
    }
    audio.currentTime=0;
    void audio.play().catch(()=>{/* Autoplay pode ser bloqueado pelo navegador. */});
  }catch{/* Sons opcionais: nunca bloquear a chegada das mensagens. */}
}
