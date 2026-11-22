import { verifiedFinanceGmailSender } from './finance-gmail-source.mjs';

// Run inside the authorized Gmail worker. This diagnostic never returns MIME,
// attachment names, PDF bytes, message IDs, sender addresses or extracted text.
const maxRawBytes = 12 * 1024 * 1024;
const maxPdfBytes = 8 * 1024 * 1024;
const maxMimeParts = 64;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(value, byteLimit, urlSafe = false) {
  if (typeof value !== 'string' || value.length > Math.ceil(byteLimit * 1.5) + 8) return null;
  const compact = urlSafe ? value.replace(/-/g, '+').replace(/_/g, '/') : value.replace(/[ \t\r\n]/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const content = compact.replace(/=+$/, '');
  const remainder = content.length % 4;
  if (remainder === 1 || (compact.length !== content.length &&
      (compact.length % 4 || compact.length - content.length !== 4 - remainder))) return null;
  const size = Math.floor(content.length * 6 / 8);
  if (size > byteLimit) return null;
  const bytes = new Uint8Array(size);
  let next = 0;
  let tail = 0;
  let tailBits = 0;
  for (const character of content) {
    tail = (tail << 6) | alphabet.indexOf(character);
    tailBits += 6;
    if (tailBits >= 8) {
      tailBits -= 8;
      bytes[next++] = tail >> tailBits;
      tail &= (1 << tailBits) - 1;
    }
  }
  return tail === 0 ? bytes : null;
}

function latin1(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return chunks.join('');
}

function readMime(entity, state, depth = 0) {
  if (depth > 8 || ++state.count > maxMimeParts) return false;
  const separator = /\r?\n\r?\n/.exec(entity.slice(0, 32768));
  if (!separator) return false;
  const header = entity.slice(0, separator.index).replace(/\r?\n[ \t]+/g, ' ');
  const type = /^content-type:[ \t]*([^\r\n]+)/im.exec(header)?.[1] ?? 'text/plain';
  const mediaType = type.split(';', 1)[0].trim().toLowerCase();
  const body = entity.slice(separator.index + separator[0].length);
  if (!mediaType.startsWith('multipart/')) {
    if (['application/pdf', 'application/octet-stream', 'bin'].includes(mediaType)) {
      const transferEncoding = /^content-transfer-encoding:\s*([a-z0-9-]+)/im.exec(header)?.[1].toLowerCase();
      state.candidates.push({ mediaType, transferEncoding, body });
    }
    return true;
  }

  const boundary = /;\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(type)?.slice(1).find(Boolean);
  if (!boundary || !/^[0-9a-z'()+_,./:=? -]{1,70}$/i.test(boundary) || boundary.endsWith(' ')) return false;
  const literal = [...boundary].map(ch => '[\\^$.*+?()[]{}|]'.includes(ch) ? '\\' + ch : ch).join('');
  const delimiter = new RegExp('^--' + literal + '(--)?[ \\t]*\\r?$', 'gm');
  let start = null;
  for (const part of body.matchAll(delimiter)) {
    if (start !== null) {
      const before = state.candidates.length;
      if (!readMime(body.slice(start, part.index), state, depth + 1)) {
        if (state.count > maxMimeParts) return false;
        state.candidates.length = before;
        state.unreadableParts++;
      }
    }
    if (part[1]) return start !== null;
    start = part.index + part[0].length + 1;
  }
  return false;
}

function pdfFraming(bytes) {
  if (!/^%PDF-\d\.\d(?:\r|\n)/.test(latin1(bytes.subarray(0, 16)))) return null;
  const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 4096)));
  const pointer = /startxref[ \t\r\n]+(\d+)[ \t\r\n]+%%EOF[ \t\r\n]*$/.exec(tail);
  const offset = Number(pointer?.[1]);
  if (!Number.isSafeInteger(offset) || offset >= bytes.length) return { framing: 'incomplete', encryption: 'unknown' };
  const region = latin1(bytes.subarray(offset, Math.min(offset + 262144, bytes.length)));
  const trailer = /^xref\s/.test(region)
    ? /(?:^|\r?\n)trailer\s*(<<[\s\S]*?)\s*startxref\b/.exec(region)?.[1]
    : /^\d+ \d+ obj\s*(<<[\s\S]*?)\s*stream\b/.exec(region)?.[1];
  if (!trailer || (!/^xref\s/.test(region) && !/\/Type\s*\/XRef\b/.test(trailer))) {
    return { framing: 'xref_unverified', encryption: 'unknown' };
  }
  const encryption = /\/Encrypt\s+(?:\d+\s+\d+\s+R\b|<<)/.test(trailer) ? 'trailer_declares_encryption' : 'unknown';
  return { framing: 'xref_observed', encryption };
}

export function inspectFinanceGmailStatement(metadata, rawMessage) {
  const sender = verifiedFinanceGmailSender(metadata);
  const unparsed = (reason, pdfs = [], uncertainParts = 0) => ({
    coverage: 'unparsed', reason, sender, pdfs, uncertainParts,
  });
  if (!sender) return unparsed('sender_unverified');
  if (!/^[a-z0-9]{10,64}$/i.test(metadata.id ?? '') || metadata.id !== rawMessage?.id) {
    return unparsed('message_identity_mismatch');
  }

  const raw = decodeBase64(rawMessage.raw, maxRawBytes, true);
  if (!raw) return unparsed('raw_mime_unavailable_or_beyond_limit');
  const state = { count: 0, candidates: [], unreadableParts: 0 };
  try {
    if (!readMime(latin1(raw), state)) return unparsed('mime_unreadable');
    const pdfs = [];
    let uncertainParts = state.unreadableParts;
    for (const part of state.candidates) {
      const bytes = part.transferEncoding === 'base64' ? decodeBase64(part.body, maxPdfBytes) : null;
      if (!bytes) {
        uncertainParts++;
        continue;
      }
      try {
        const pdf = pdfFraming(bytes);
        if (pdf) pdfs.push({ mediaType: part.mediaType, bytes: bytes.length, ...pdf });
        else if (part.mediaType === 'application/pdf') uncertainParts++;
      } finally {
        bytes.fill(0);
      }
    }
    return unparsed(pdfs.length ? 'attachment_inspected_rows_unverified' : 'pdf_unavailable', pdfs, uncertainParts);
  } finally {
    raw.fill(0);
  }
}
