import test from "node:test";
import assert from "node:assert/strict";
import { createMediaPreviewUrls } from "../application/media-preview-urls.mjs";

test("scope exit releases abandoned composer previews and pending audio", t => {
  const created = [];
  const revoked = [];
  t.mock.method(URL, "createObjectURL", blob => {
    assert.ok(blob instanceof Blob);
    const url = `blob:preview-${created.length}`;
    created.push(url);
    return url;
  });
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  const urls = createMediaPreviewUrls();
  const photo = urls.create(new Blob(["photo"]));
  const audio = urls.create(new Blob(["audio"]));
  const failedUpload = urls.create(new Blob(["failed upload"]));
  urls.release(photo);
  assert.deepEqual(revoked, [photo], "transferred audio remains alive for pending playback");
  urls.clear();
  assert.deepEqual(revoked, [photo, audio, failedUpload]);
  urls.release(photo);
  urls.release(audio);
  urls.clear();
  assert.equal(revoked.length, 3, "settling a request after scope exit is harmless");
});

test("Atendimentos distingue figurinhas, autoria interna e coleção privada por empresa", async () => {
  const { readFileSync } = await import("node:fs");
  const read = path => readFileSync(new URL("../../../../"+path,import.meta.url),"utf8");
  const page=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const picker=read("src/features/whatsapp-channels/presentation/UnionWhatsAppStickerPicker.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const bridge=read("services/union-wuzapi-bridge/server.mjs");
  const schema=read("supabase/migrations/20261111175500_union_whatsapp_sticker_library.sql");

  assert.match(page,/message\.message_type==="sticker"/);
  assert.match(page,/max-h-\[min\(44dvh,320px\)\]/);
  assert.match(page,/sender_name &&/);
  assert.match(page,/onSaveSticker=/);
  assert.doesNotMatch(page,/onResendSticker|resendReceivedSticker|> Reenviar/);
  assert.match(page,/stickerZoom && mediaUrl/);
  assert.match(page,/persistedProviderIds=new Set\(messages\.map/);
  assert.match(page,/local\.filter\(item=>!item\.providerMessageId \|\| !persistedProviderIds\.has\(item\.providerMessageId\)\)/);
  assert.match(page,/item\.status==="sent" && item\.providerMessageId/);
  assert.match(page,/role="status" aria-label="Carregando figurinha"/);
  assert.match(page,/role="status" aria-label="Carregando arquivo"/);
  assert.match(page,/fileType==="sticker"\|\|fileType==="image"/);
  assert.match(page,/pendingMediaPreviewUrlsRef/);
  assert.match(picker,/Da empresa/);
  assert.match(picker,/Recentes/);
  assert.match(picker,/Favoritas/);
  assert.match(edge,/action==="sticker_list"/);
  assert.match(edge,/action==="sticker_save"/);
  assert.match(edge,/action==="sticker_prepare"/);
  assert.match(edge,/action==="sticker_commit"/);
  assert.match(page,/uploadStickerToLibrary/);
  assert.match(edge,/action==="sticker_favorite"/);
  assert.match(edge,/action==="sticker_send"/);
  assert.match(edge,/message_type:isMedia\?kind:"text"/);
  assert.match(edge,/sender_name:senderName/);
  assert.match(edge,/const outboundText=!isMedia && senderName/);
  assert.match(edge,/body_text:outboundText,sender_name:senderName/);
  assert.match(page,/role="menu" aria-label="Opções da conversa"/);
  // Options must be anchored to the full composer, not the narrow menu
  // button, so touch screens do not clip the panel off the right edge.
  assert.match(page,/inset-x-0 bottom-\[calc\(100%\+8px\)\]/);
  assert.match(page,/max-h-\[min\(44dvh,320px\)\]/);
  assert.match(page,/flex-wrap items-end rounded-xl/);
  assert.match(page,/xl:flex-nowrap/);
  assert.match(page,/aria-label="Mais opções da conversa"/);
  assert.match(page,/onClick=\{\(\)=>setActionPanel\("documents"\)\}/);
  assert.match(page,/Enviar documento da OS/);
  assert.doesNotMatch(page,/documentInputRef|aria-label=\{onPrepareOrderDocument\?/);
  assert.match(page,/aria-label="Voltar às opções"/);
  assert.match(page,/aria-label="Carregando mensagens rápidas"/);
  assert.match(bridge,/const audio=kind==="audio" \? await toPlayableAudio\(buffer\) : null/);
  assert.match(bridge,/MimeType:"audio\/mpeg",PTT:false,Seconds:audio\.seconds/);
  assert.match(bridge,/path="\/chat\/send\/sticker"/);
  assert.match(schema,/enable row level security/);
  assert.match(schema,/revoke all on public\.union_whatsapp_sticker_library from public,anon,authenticated/);
  assert.match(schema,/storage_path like organization_id::text \|\| '\/stickers\/%'/);
});

test("salvar figurinha é otimista, compacto e restaura a ação sem erro visual", async () => {
  const { readFileSync } = await import("node:fs");
  const read = path => readFileSync(new URL("../../../../"+path,import.meta.url),"utf8");
  const page=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(page,/stickerSaved=\{savedStickerMessageIds\.has\(entry\.message\.id\)\}/);
  assert.match(page,/text-\[9px\] leading-none/);
  assert.match(page,/text-amber-500/);
  assert.match(page,/<Star size=\{13\} fill="currentColor"/);
  assert.match(page,/setSavedStickerMessageIds\(current=>new Set\(current\)\.add\(message\.id\)\)/);
  assert.match(page,/next\.delete\(message\.id\)/);
  assert.match(page,/\/\/ Silent rollback: restore the small Save action without a toast/);
  assert.match(page,/const nextFavorite=!sticker\.is_favorite/);
  assert.match(page,/is_favorite:nextFavorite/);
  assert.match(edge,/action==="sticker_saved_ids"/);
  assert.match(edge,/\.eq\("conversation_id",thread\.id\)/);
  assert.match(edge,/\.in\("source_message_id",owned\.map\(row=>row\.id\)\)/);
  assert.match(repository,/message_ids\?: string\[\]/);
  assert.match(repository,/saved_message_ids\?: string\[\]/);
});

test("editar contato abre modal isolado e campos obrigatórios usam asterisco vermelho", async () => {
  const { readFileSync } = await import("node:fs");
  const read = file => readFileSync(new URL("../../../../"+file,import.meta.url),"utf8");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const edit=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactEditDialog.tsx");
  const directory=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const common=read("src/shared/ui/admin/AdminFormControls.tsx");
  assert.match(inbox, /<UnionWhatsAppContactEditDialog/);
  assert.match(inbox, /contactsOpen && !editContactId/);
  assert.match(inbox, /setContactsOpen\(false\);setEditContactId\(selected\.id\)/);
  assert.match(edit, /"contacts_save"/);
  assert.match(edit, /"check_number"/);
  assert.doesNotMatch(edit, /"contacts_list"|"contacts_import"/);
  assert.match(edit, /<AdminDialog open title="Editar contato"/);
  assert.match(edit, /<RequiredFieldLabel label="Nome salvo na Union" required\/>/);
  assert.match(edit, /<RequiredFieldLabel label="WhatsApp" required=/);
  assert.match(directory, /<RequiredFieldLabel label="Nome salvo na Union" required\/>/);
  assert.match(directory, /<RequiredFieldLabel label="WhatsApp" required\/>/);
  assert.match(common, /data-admin-required-indicator="true"/);
  assert.match(common, /text-red-600 dark:text-red-400/);
});


test("imagens recebidas abrem visualizador unificado e sem nova aba", async () => {
  const { readFileSync } = await import("node:fs");
  const read = file => readFileSync(new URL("../../../../"+file,import.meta.url),"utf8");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const details=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  const viewer=read("src/features/whatsapp-channels/presentation/UnionWhatsAppMediaViewer.tsx");
  assert.match(inbox, /onClick=\{\(\)=>setImageZoom\(true\)\}/);
  assert.match(inbox, /imageZoom && mediaUrl && <UnionWhatsAppMediaViewer/);
  assert.doesNotMatch(inbox, /message\.message_type==="image" && <a href=\{mediaUrl\} target="_blank"/);
  assert.match(details, /preview&&<UnionWhatsAppMediaViewer/);
  assert.match(viewer, /bg-black\/55/);
  assert.match(viewer, /onClose/);
  assert.match(viewer, /event\.key==="Escape"/);
  assert.match(viewer, /Abrir arquivo/);
});

test("visualizador do WhatsApp oferece zoom, arrastar e controles com cores do tema", async () => {
  const { readFileSync } = await import("node:fs");
  const viewer=readFileSync(new URL("../presentation/UnionWhatsAppMediaViewer.tsx",import.meta.url),"utf8");
  assert.match(viewer,/aria-label="Ampliar zoom"/);
  assert.match(viewer,/aria-label="Reduzir zoom"/);
  assert.match(viewer,/aria-label="Restaurar zoom"/);
  assert.match(viewer,/addEventListener\("wheel",onWheel,\{passive:false\}\)/);
  assert.match(viewer,/onPointerDown=\{onPointerDown\}/);
  assert.match(viewer,/onPointerMove=\{onPointerMove\}/);
  assert.match(viewer,/onDoubleClick=/);
  assert.match(viewer,/touchAction:"none"/);
  assert.match(viewer,/bg-card px-3 py-2 text-xs font-bold text-card-foreground/);
  assert.doesNotMatch(viewer,/rounded-md bg-white px-3 py-2 text-xs font-bold text-gray-900/);
});

test("Nomes dos documentos WhatsApp nao usam o UUID interno do Storage",async()=>{
  const {readFileSync}=await import("node:fs");
  const read=path=>readFileSync(new URL("../../../../"+path,import.meta.url),"utf8");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const bridge=read("services/union-wuzapi-bridge/server.mjs");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const details=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  const viewer=read("src/features/whatsapp-channels/presentation/UnionWhatsAppMediaViewer.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const order=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const warranty=read("src/features/orders/application/order-warranty.ts");
  assert.match(order,/generatedFileName\(template.name \|\| "Documento"/);
  assert.match(warranty,/new File\(\[blob\],"Certificado de Garantia - "\+safeNumber\+"\.pdf"/);
  assert.match(bridge,/Document:dataUrl,FileName:name/);
  assert.match(edge,/kind==="file" \? \{download:name\} : undefined/);
  assert.match(edge,/createSignedUrl\(\s*mediaPath,120,\{download:originalName\}\)/);
  assert.match(edge,/download_url:downloadUrl/);
  assert.match(edge,/mediaFileName=String\(ref.file_name\|\|mediaFileName\)/);
  assert.match(repository,/download_url\?: string\|null/);
  assert.match(inbox,/href=\{mediaDownloadUrl\|\|mediaUrl\}/);
  assert.match(details,/downloadUrl:links.downloadUrl/);
  assert.match(viewer,/href=\{downloadUrl\|\|url\}/);
  assert.match(viewer,/download=\{name\}/);
});

test("visualizador do WhatsApp gira imagens nos dois sentidos, sem alterar mídia original",async()=>{
  const {readFileSync}=await import("node:fs");
  const viewer=readFileSync(new URL("../presentation/UnionWhatsAppMediaViewer.tsx",import.meta.url),"utf8");
  const {transformWithEsbuild}=await import("vite");
  assert.ok((await transformWithEsbuild(viewer,"UnionWhatsAppMediaViewer.tsx",{loader:"tsx"})).code.length>100);
  assert.match(viewer,/aria-label="Girar imagem 90 graus à esquerda"/);
  assert.match(viewer,/aria-label="Girar imagem 90 graus à direita"/);
  assert.match(viewer,/rotateImage\(-90\)/);
  assert.match(viewer,/rotateImage\(90\)/);
  assert.match(viewer,/rotate\("\+rotation\+"deg\)/);
  assert.match(viewer,/rotationRef\.current=0;/);
  assert.match(viewer,/setRotation\(0\);/);
  assert.match(viewer,/useLayoutEffect/);
  assert.match(viewer,/ResizeObserver\(syncDimensions\)/);
  assert.match(viewer,/aria-label="Restaurar zoom"/);
  assert.match(viewer,/touchAction:"none"/);
  assert.match(viewer,/downloadUrl\|\|url/);
});
test("rotação respeita encaixe na tela e limites de arraste nas quatro orientações",async()=>{
  const {readFileSync}=await import("node:fs");
  const {transformWithEsbuild}=await import("vite");
  const helper=readFileSync(new URL("./media-viewer-rotation.ts",import.meta.url),"utf8");
  const built=await transformWithEsbuild(helper,"media-viewer-rotation.ts",{loader:"ts",format:"esm"});
  const {normalizeMediaRotation,mediaViewerFitScale,mediaViewerPanBounds}=await import("data:text/javascript;base64,"+Buffer.from(built.code).toString("base64"));
  assert.equal(normalizeMediaRotation(-90),270);
  assert.equal(normalizeMediaRotation(450),90);
  assert.equal(normalizeMediaRotation(720),0);
  assert.equal(mediaViewerFitScale(600,300,600,400,0),1);
  assert.equal(mediaViewerFitScale(600,300,600,400,90),2/3);
  assert.equal(mediaViewerFitScale(600,300,600,400,270),2/3);
  assert.equal(mediaViewerFitScale(600,300,600,400,180),1);
  assert.equal(mediaViewerFitScale(0,0,600,400,90),1);
  assert.deepEqual(mediaViewerPanBounds({imageWidth:600,imageHeight:300,viewportWidth:600,viewportHeight:400,rotation:90,zoom:1,fitScale:2/3}),{maxX:0,maxY:0});
  assert.deepEqual(mediaViewerPanBounds({imageWidth:600,imageHeight:300,viewportWidth:600,viewportHeight:400,rotation:90,zoom:3,fitScale:2/3}),{maxX:0,maxY:400});
});


test("visualizador destaca fotos e baixa WebP sem consultar mídia novamente quando já decodificada",async()=>{
  const {readFileSync}=await import("node:fs");
  const {transformWithEsbuild}=await import("vite");
  const viewer=readFileSync(new URL("../presentation/UnionWhatsAppMediaViewer.tsx",import.meta.url),"utf8");
  const popup=readFileSync(new URL("../presentation/useDetachedMediaWindow.ts",import.meta.url),"utf8");
  const download=readFileSync(new URL("../application/download-media-webp.ts",import.meta.url),"utf8");
  assert.match(viewer,/onClick=\{detached\?reintegrate:detach\}/);
  assert.match(viewer,/Destacar janela/);
  assert.match(viewer,/aria-label="Baixar imagem em WebP"/);
  assert.match(viewer,/createPortal\(viewer,detached.host\)/);
  assert.match(viewer,/ownerDocument.addEventListener\("keydown",onEscape,true\)/);
  assert.match(viewer,/\},\[isImage,detached\]\)/);
  assert.match(popup,/window.open\("","_blank","popup=yes/);
  assert.match(popup,/popup.opener=null/);
  assert.match(popup,/if\(unavailable\)/);
  assert.doesNotMatch(popup,/supabase|fetch\(/);
  assert.match(download,/encodeWebp\(image,image.naturalWidth,image.naturalHeight,doc\)/);
  assert.match(download,/canvas.toBlob\(resolve,"image\/webp",0.94\)/);
  assert.match(download,/blob.type!=="image\/webp"/);
  assert.match(download,/if\(!blob\)\{/);
  assert.match(download,/anchor.download=base\+"\.webp"/);
  assert.match(download,/URL.revokeObjectURL/);
  for(const [name,code] of [["UnionWhatsAppMediaViewer.tsx",viewer],["useDetachedMediaWindow.ts",popup],["download-media-webp.ts",download]]){
    assert.ok((await transformWithEsbuild(code,name,{loader:name.endsWith(".tsx")?"tsx":"ts"})).code);
  }
});
