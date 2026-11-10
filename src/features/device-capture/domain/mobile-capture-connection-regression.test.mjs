import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("produto permite capturar somente a capa por câmera ou galeria com contador atualizado pelo desktop", async () => {
  const mobile = read("src/features/device-capture/presentation/MobileDeviceCapturePage.tsx");
  const gateway = read("src/features/orders/infrastructure/device-capture.gateway.ts");
  const edge = read("supabase/functions/device-capture/index.ts");
  const migration = read("supabase/migrations/20261107195000_product_device_capture_photo_sync.sql");
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  for (const [name, source] of [
    ["MobileDeviceCapturePage.tsx", mobile],
    ["TabProducts.tsx", editor],
  ]) assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);

  assert.ok(mobile.includes('captureContext === "product" ? <>'));
  assert.ok(mobile.includes('ref={coverGalleryInputRef} type="file" accept="image/*" className="hidden"'));
  assert.ok(mobile.includes('ref={labelInputRef} type="file" accept="image/*" capture="environment"'));
  assert.ok(mobile.includes('void uploadPhoto("label", file)'));
  assert.ok(mobile.includes('{photoCount} de 4 fotos enviadas'));
  assert.ok(mobile.includes("onSessionChange: row =>"));
  assert.ok(mobile.includes("row.product_photo_count"));
  assert.ok(mobile.includes("row.product_has_cover"));
  assert.ok(mobile.includes("window.setInterval(() => { void refreshPhotoState(); }, 5000)"));
  assert.ok(gateway.includes('action: "sync_product_photos"'));
  assert.ok(edge.includes('action === "sync_product_photos"'));
  assert.ok(edge.includes('session.capture_context === "product" && kind !== "label"'));
  assert.ok(edge.includes('sessionUpdate.product_photo_count = nextCount'));
  assert.ok(edge.includes('sessionUpdate.product_has_cover = true'));
  assert.ok(edge.includes('!(await canUseCapture(admin, session, user.id))'));
  assert.ok(migration.includes("add column if not exists product_photo_count"));
  assert.ok(migration.includes("add column if not exists product_has_cover"));
  assert.ok(editor.includes("productPhotoCount={galleryPhotoCount}"));
  assert.ok(editor.includes('key={`product-capture-${editItem?.id || "new"}`}'), "Cada produto precisa de sessão de captura isolada");
  assert.ok(editor.includes("onPhoto={(file, kind) => handleProductMobilePhoto(file, kind)}"), "Deve aguardar o upload real");
  const bridge = read("src/features/orders/presentation/DeviceCaptureBridge.tsx");
  assert.ok(bridge.includes("await onPhotoRef.current(file, event.kind)"), "A ordem de eventos deve aguardar o processamento");
  assert.ok(bridge.includes("onPhotoRef.current = onPhoto"));
  assert.ok(bridge.includes("onSerialRef.current = onSerial"));
  assert.ok(!bridge.includes("context, onPhoto, onSerial]"), "Receber foto não deve recriar a assinatura Realtime");
  assert.ok(editor.includes("sm:items-start"), "A capa não deve esticar com o textarea");
  assert.ok(editor.includes("throw error;"), "Falha real no upload não pode contar como foto recebida");
  assert.ok(editor.includes("productHasCover={Boolean(form.cover_media_id)}"));
  assert.ok(editor.includes('setGalleryMedia(current => current.filter(image => image.media_id !== oldCoverId))'));
});

test("capa tem altura fixa e imagem encaixa sem esticar quando sobe pelo celular", async () => {
  const media = read("src/shared/ui/admin/AdminMedia.tsx");
  assert.ok((await transformWithEsbuild(media, "AdminMedia.tsx", { loader: "tsx" })).code);
  assert.ok(media.includes("h-32 max-h-32"));
  assert.ok(media.includes("sm:h-36 sm:max-h-36"));
  assert.ok(media.includes('className="block h-full max-h-full w-full max-w-full object-contain"'));
});

test("todos os modais Usar celular fecham ao conectar, bolinha verde pulsante e botão Encerrando ao lado do código", async () => {
  const files = [
    "src/features/orders/presentation/DeviceCaptureBridge.tsx",
    "src/features/orders/presentation/OrderMobileEditBridge.tsx",
    "src/features/checklists/presentation/OrderChecklistMobileBridge.tsx",
  ];
  const mobileButton = read("src/shared/ui/admin/AdminUseMobileButton.tsx");
  assert.ok((await transformWithEsbuild(mobileButton, "AdminUseMobileButton.tsx", { loader: "tsx" })).code);
  assert.ok(mobileButton.includes('animate-ping rounded-full bg-emerald-300'));
  assert.ok(mobileButton.includes('border-primary/30'));
  for (const file of files) {
    const source = read(file);
    assert.ok((await transformWithEsbuild(source, file, { loader: "tsx" })).code, file);
    assert.ok(source.includes('if (value && !errorRef.current) setOpen(false)'), file);
    assert.ok(source.includes('<AdminUseMobileButton'), file);
    assert.ok(source.includes('loading={ending} loadingText="Encerrando..."'), file);
    assert.ok(source.includes("setOpen(true);") && source.includes("setError(closeError instanceof Error"), file);
    const codeRow = source.indexOf('border-[#0057e7]/20 bg-[#eef5ff]');
    const codeMarkup = source.slice(codeRow - 80, codeRow + 1400);
    assert.ok(codeMarkup.includes('flex min-w-0 items-center gap-2'), "Código e encerramento devem compartilhar uma row: " + file);
    assert.ok(!codeMarkup.includes("flex-wrap items-center justify-between"), "Código e encerramento não devem quebrar de linha: " + file);

    const endButton = source.indexOf('onClick={() => void endSession()}', codeRow);
    assert.ok(endButton > codeRow && endButton < codeRow + 1300, "Encerrar ao lado do código: " + file);
  }
});
