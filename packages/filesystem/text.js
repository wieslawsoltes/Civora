/** Bounded, reversible BOM-aware local text editing. Binary files remain binary. */
import { localError } from './index.js';
export async function decodeTextFile(blob) {
  if (blob.size > 2 * 1024 * 1024) throw localError('The built-in local text editor is limited to 2 MiB. Use your native editor for larger files.');
  const bytes = new Uint8Array(await blob.arrayBuffer()); let encoding = 'utf-8', bom = false, offset = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { bom = true; offset = 3; }
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; bom = true; offset = 2; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; bom = true; offset = 2; }
  let text; try { text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(offset)); } catch { throw localError('This is binary data or an unsupported text encoding. Use a native editor.'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw localError('Binary control bytes were detected. This file will not be edited as text.');
  const crlf = (text.match(/\r\n/g) || []).length, lf = (text.match(/(?<!\r)\n/g) || []).length, cr = (text.match(/\r(?!\n)/g) || []).length;
  const newline = crlf >= lf && crlf >= cr && crlf ? '\r\n' : cr > lf ? '\r' : '\n';
  return { text, encoding, bom, newline, mixedNewlines: [crlf, lf, cr].filter(Boolean).length > 1 };
}
export function encodeTextFile(document, text) {
  if (typeof text !== 'string' || !['utf-8','utf-16le','utf-16be'].includes(document.encoding) || !['\n','\r\n','\r'].includes(document.newline)) throw localError('Invalid text encoding settings.');
  text = text.replace(/\r\n|\r|\n/g, document.newline); let bytes;
  if (document.encoding === 'utf-8') bytes = new TextEncoder().encode(text);
  else { bytes = new Uint8Array(text.length * 2); const view = new DataView(bytes.buffer); for (let i = 0; i < text.length; i++) view.setUint16(i*2, text.charCodeAt(i), document.encoding === 'utf-16le'); }
  const prefix = document.bom ? document.encoding === 'utf-8' ? [0xef,0xbb,0xbf] : document.encoding === 'utf-16le' ? [0xff,0xfe] : [0xfe,0xff] : [];
  return new Blob([new Uint8Array(prefix), bytes], { type: 'text/plain' });
}
