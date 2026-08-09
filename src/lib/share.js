// Shareable links with no backend: the whole project is deflate-compressed
// and base64url-encoded into the URL hash. Anyone opening the link gets a
// full working copy of the model in their browser.

function base64urlEncode(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encodeModelToHash(doc) {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return 'z' + base64urlEncode(compressed);
  }
  return 'j' + base64urlEncode(bytes);
}

export async function decodeModelFromHash(data) {
  const kind = data[0];
  const bytes = base64urlDecode(data.slice(1));
  if (kind === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const json = await new Response(stream).text();
    return JSON.parse(json);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
