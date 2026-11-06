import { IMAGE_PRESETS } from './upload-image-profiles.ts';

const invalid = message => Object.assign(new Error(message), { status: 400 });
const text = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

// Inspect bounded container headers rather than decoding pixels inside an Edge
// Function. This verifies the actual submitted bytes, never a client flag.
export async function inspectUploadImage(file) {
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (bytes.length >= 24 && bytes[0] === 137 && text(bytes, 1, 7) === 'PNG\r\n\x1a\n' && text(bytes, 12, 4) === 'IHDR') {
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP') {
    const chunk = text(bytes, 12, 4);
    if (chunk === 'VP8X') {
      const uint24 = i => bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16);
      return { type: 'image/webp', width: 1 + uint24(24), height: 1 + uint24(27) };
    }
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      return { type: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      return { type: 'image/webp', width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= file.size) {
      // Skip APP/EXIF payloads by length, even if the SOF follows megabytes of
      // metadata. Read only small headers instead of buffering those payloads.
      const header = new Uint8Array(await file.slice(offset, offset + 12).arrayBuffer());
      const segment = new DataView(header.buffer);
      if (header[0] !== 0xff) break;
      let prefix = 1;
      while (prefix < header.length && header[prefix] === 0xff) prefix++;
      if (prefix === header.length) { offset += prefix - 1; continue; }
      const marker = header[prefix];
      const start = prefix + 1;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += start; continue; }
      if (start + 2 > header.length) break;
      const length = segment.getUint16(start);
      if (length < 2 || offset + start + length > file.size) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7 && start + 7 <= header.length) {
        return { type: 'image/jpeg', width: segment.getUint16(start + 5), height: segment.getUint16(start + 3) };
      }
      offset += start + length;
    }
  }
  throw invalid('Não foi possível validar a imagem. Selecione novamente uma foto JPG, PNG ou WebP.');
}

export async function assertPreparedUploadImage(file, preset = 'service-photo') {
  const config = IMAGE_PRESETS[preset];
  if (!config) throw invalid('Perfil de imagem inválido.');
  const image = await inspectUploadImage(file);
  if (image.type !== file.type || image.width < 1 || image.height < 1) {
    throw invalid('O conteúdo da imagem não corresponde ao formato informado.');
  }
  // A server cannot prove whether a valid image was already optimized. Preserve
  // efficient originals even when their dimensions exceed a photo profile. The
  // browser applies the shared profile before transfer; the Edge validates the
  // container, declared MIME and hard source resource limits only.
  if (file.size > 25 * 1024 * 1024 || image.width * image.height > 128 * 1024 * 1024) {
    throw invalid('A imagem excede o limite de processamento. Reduza a foto antes do envio.');
  }
  return image;
}
