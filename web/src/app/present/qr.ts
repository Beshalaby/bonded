// A small, self-contained QR Code encoder: byte mode, error correction level M, versions 1–10 (up to 213 bytes).
// Follows ISO/IEC 18004 the same way Project Nayuki's reference encoder does (Reed–Solomon over GF(256) with
// polynomial 0x11D, block interleaving, all 8 masks scored with the standard penalty rules). Pure: no DOM, no deps.

/** ECC codewords per block and number of blocks at level M, indexed by version (1–10). */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < degree) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 2);
  }
  return r;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((d, i) => { r[i] ^= gfMul(d, f); });
  }
  return r;
}

/** Encode `text` (UTF-8) as a QR code. Returns a square matrix, true = dark. Throws if it needs more than version 10. */
export function encodeQR(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new Error("QR: text too long for version 10-M");

  // ---- data bits: mode 0100, length, bytes, terminator, pad
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // ---- split into blocks, add ECC, interleave
  const nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) codewords.push(b[i]); });
  }

  // ---- function patterns
  const size = ver * 4 + 17;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignmentPositions(ver), last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const drawFormat = (mask: number) => {
    const d = (0 << 3) | mask; // level M = 0b00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  drawFormat(0); // reserve
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, bit(b, i)); set(c, a, bit(b, i));
    }
  }

  // ---- data modules, zigzag
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && k < codewords.length * 8) { mod[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
    }
  }

  // ---- masks
  const MASKS: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
  };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const s = penalty(mod);
    if (s < bestScore) { bestScore = s; best = m; }
    applyMask(m); // XOR undoes it
  }
  applyMask(best); drawFormat(best);
  return mod;
}

/** The four standard penalty rules (lower is better). */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0, dark = 0;
  const line = (get: (i: number) => boolean) => {
    let s = 0, run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else { if (run >= 5) s += 3 + run - 5; run = 1; }
    }
    // finder-like 1:1:3:1:1 with 4 light modules on either side (outside the symbol counts as light)
    const at = (i: number) => (i >= 0 && i < n ? get(i) : false);
    for (let i = -4; i < n; i++) {
      if (at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6)) {
        const before = !at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4);
        const after = !at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10);
        if (before || after) s += 40;
      }
    }
    return s;
  };
  for (let y = 0; y < n; y++) score += line((i) => m[y][i]);
  for (let x = 0; x < n; x++) score += line((i) => m[i][x]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  for (const row of m) for (const c of row) if (c) dark++;
  const total = n * n;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}
