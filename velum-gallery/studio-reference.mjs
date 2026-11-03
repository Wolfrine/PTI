const MAX_SOURCE = 16 * 1024 * 1024;
export const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;
export const MAX_REFERENCES = 10;

export async function decodeReference(manifest,chunks){
  if(!manifest||!['image/png','image/jpeg'].includes(manifest.mime)||!Number.isInteger(manifest.bytes)||manifest.bytes<100||manifest.bytes>MAX_REFERENCE_BYTES||!Number.isInteger(manifest.chunks)||manifest.chunks<1||manifest.chunks>5||!/^[a-f0-9]{64}$/.test(manifest.sha256)||chunks.length!==manifest.chunks)throw new Error('Invalid source reference manifest.');
  const parts=[...chunks].sort((a,b)=>a.index-b.index).map((chunk,index)=>{if(chunk.index!==index||typeof chunk.data!=='string'||!chunk.data.length||chunk.data.length>600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.data))throw new Error('Invalid source reference chunks.');return Uint8Array.from(atob(chunk.data),char=>char.charCodeAt(0));});
  const bytes=new Uint8Array(parts.reduce((total,part)=>total+part.length,0));let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  const header=imageHeader(bytes);if(bytes.length!==manifest.bytes||hash!==manifest.sha256||header.mime!==manifest.mime||header.width!==manifest.width||header.height!==manifest.height)throw new Error('Source reference integrity check failed.');
  return new Blob([bytes],{type:manifest.mime});
}

export function imageHeader(bytes) {
  if (bytes.length < 24) throw new Error('Image file is incomplete.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) throw new Error('JPEG header is invalid.');
      let marker = bytes[++offset];
      while (marker === 255) marker = bytes[++offset];
      offset++;
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error('JPEG header is incomplete.');
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { mime: 'image/jpeg', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      offset += length;
    }
  }
  throw new Error('Choose a PNG or JPEG image. Other formats are not accepted.');
}

export async function prepareReference(blob, source = { kind: 'file', id: 'local', name: 'Reference image' }) {
  if (!(blob instanceof Blob) || blob.size < 24 || blob.size > MAX_SOURCE) throw new Error('Choose a PNG or JPEG smaller than 16 MB.');
  const header = imageHeader(new Uint8Array(await blob.arrayBuffer()));
  if (blob.type && !['image/png', 'image/jpeg'].includes(blob.type)) throw new Error('Choose a PNG or JPEG image.');
  if (header.width < 1 || header.height < 1 || Math.max(header.width, header.height) > 8192 || header.width * header.height > 24000000) throw new Error('Reference image dimensions exceed the safe decode limit.');
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.floor(bitmap.width * scale)), height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
    let transported = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!transported || transported.size > MAX_REFERENCE_BYTES) transported = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .75));
    if (!transported || transported.size > MAX_REFERENCE_BYTES) throw new Error('This image is too large for private reference transfer.');
    const bytes = new Uint8Array(await transported.arrayBuffer());
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    const binary = Array.from(bytes, value => String.fromCharCode(value)).join('');
    const encoded = btoa(binary), chunks = [];
    for (let offset = 0; offset < encoded.length; offset += 600000) chunks.push({ index: chunks.length, data: encoded.slice(offset, offset + 600000) });
    return { blob: transported, url: URL.createObjectURL(transported), chunks,
      manifest: { mime: 'image/jpeg', bytes: bytes.length, sha256, width, height, chunks: chunks.length,
        source: { kind: ['file', 'studio', 'drive'].includes(source.kind) ? source.kind : 'file', id: String(source.id || 'local').slice(0, 160), name: String(source.name || 'Reference image').slice(0, 160) } } };
  } finally { bitmap.close(); }
}
