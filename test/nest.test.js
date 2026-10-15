// Pruebas del acomodo por forma (sección NEST del .jsx).
// Uso: node test/nest.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "AutoSort-Gangsheet.jsx"), "utf8");
const Nest = new Function(src.slice(src.indexOf("// === NEST START ==="), src.indexOf("// === NEST END ===")) + "\nreturn Nest;")();

let passed = 0;
function test(name, fn) {
  const t = Date.now();
  fn();
  passed++;
  console.log(`ok - ${name} (${Date.now() - t} ms)`);
}

// --------------------------------------------------------------- PNG ---
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Codifica RGBA (alpha según fn) con el filtro indicado por fila.
function encodePng(w, h, alphaFn, { level = 6, filters = [0], colorType = 6 } = {}) {
  const ch = colorType === 6 ? 4 : 2;
  const rows = [];
  let prev = Buffer.alloc(w * ch);
  for (let y = 0; y < h; y++) {
    const cur = Buffer.alloc(w * ch);
    for (let x = 0; x < w; x++) {
      const a = alphaFn(x, y);
      if (ch === 4) { cur[x * 4] = (x * 7) & 255; cur[x * 4 + 1] = (y * 3) & 255; cur[x * 4 + 2] = 200; cur[x * 4 + 3] = a; }
      else { cur[x * 2] = (x + y) & 255; cur[x * 2 + 1] = a; }
    }
    const f = filters[y % filters.length];
    const out = Buffer.alloc(w * ch + 1);
    out[0] = f;
    for (let i = 0; i < w * ch; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i + 1] = (cur[i] - p) & 255;
    }
    rows.push(out);
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const binStr = (buf) => buf.toString("latin1"); // como File.read() en modo BINARY

test("inflate: bloques sin compresión, fijos y dinámicos", () => {
  const data = Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 31 + (i >> 7)) & 255));
  for (const level of [0, 1, 9]) {
    const out = Nest.inflate(Array.from(zlib.deflateSync(data, { level })));
    assert.strictEqual(out.length, data.length);
    assert(Buffer.from(out).equals(data), "nivel " + level);
  }
  const txt = Buffer.from("hola hola hola gangsheet ".repeat(50));
  assert(Buffer.from(Nest.inflate(Array.from(zlib.deflateSync(txt, { strategy: zlib.constants.Z_FIXED })))).equals(txt));
});

test("decodePng: RGBA y gris+alfa con los 5 filtros", () => {
  const fn = (x, y) => ((x - 20) ** 2 + (y - 15) ** 2 < 100 ? 255 : (x + y) % 7 === 0 ? 3 : 0);
  for (const colorType of [6, 4]) {
    for (const level of [0, 9]) {
      const png = encodePng(41, 33, fn, { level, filters: [0, 1, 2, 3, 4], colorType });
      const img = Nest.decodePng(binStr(png));
      assert.strictEqual(img.width, 41);
      assert.strictEqual(img.height, 33);
      for (let y = 0; y < 33; y++) for (let x = 0; x < 41; x++) assert.strictEqual(img.alpha[y * 41 + x], fn(x, y));
    }
  }
});

test("maskFromAlpha reduce con OR (conservador)", () => {
  const img = { width: 4, height: 4, alpha: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0] };
  const m = Nest.maskFromAlpha(img, 2, 2, 2);
  assert.deepStrictEqual(m.d, [0, 0, 0, 1]);
});

// ------------------------------------------------------------ Máscaras ---
function maskFrom(w, h, fn) {
  const m = Nest.emptyMask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y)) m.d[y * w + x] = 1;
  return m;
}
const get = (m, x, y) => m.d[y * m.w + x];

test("rotateMask: 90° antihorario y 4 giros = identidad", () => {
  const m = maskFrom(3, 2, (x, y) => x === 0 && y === 0); // esquina sup. izq.
  const r = Nest.rotateMask(m, 1);
  assert.deepStrictEqual([r.w, r.h], [2, 3]);
  assert.strictEqual(get(r, 0, 2), 1, "la esquina sup. izq. pasa a la inf. izq.");
  const rnd = maskFrom(7, 5, (x, y) => (x * 3 + y * 5) % 4 === 0);
  assert.deepStrictEqual(Nest.rotateMask(rnd, 4).d, rnd.d);
  assert.deepStrictEqual(Nest.rotateMask(Nest.rotateMask(rnd, 1), 3).d, rnd.d);
  // rotVec coincide con rotateMask: vector a la derecha -> arriba
  assert.deepStrictEqual(Nest.rotVec(1, 0, 1), [0, -1]);
  assert.deepStrictEqual(Nest.rotVec(0, 1, 1), [1, 0]);
});

test("kernel: separación exacta entre cuadros de celdas", () => {
  const MM = 2.834645669;
  const k0 = Nest.kernel(0, 2 * MM);
  assert.deepStrictEqual(k0, { r: 0, ex: [0] });
  const k = Nest.kernel(3 * MM, 2 * MM); // celdas de 2 mm, separación 3 mm
  assert.strictEqual(k.r, 2);
  assert.deepStrictEqual(k.ex, [2, 2, 2, 2, 2]);
  const k2 = Nest.kernel(5 * MM, 2 * MM);
  assert.strictEqual(k2.r, 3);
  assert.deepStrictEqual(k2.ex, [2, 3, 3, 3, 3, 3, 2]);
});

// ------------------------------------------------------------- Acomodo ---
const MM = 2.834645669;

// Distancia mínima (en celdas de tamaño cell) entre las piezas colocadas.
function checkPlacements(placements, shapesById, gridW, gridH, gapPt, cellPt) {
  const owner = new Map();
  const cellsOf = [];
  placements.forEach((p, idx) => {
    const m = Nest.rotateMask(shapesById[p.id].mask, p.k);
    const cells = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!m.d[y * m.w + x]) continue;
      const gx = p.x + x, gy = p.y + y;
      assert(gx >= 0 && gx < gridW && gy >= 0 && gy < gridH, "fuera de la hoja");
      const key = gx + "," + gy;
      assert(!owner.has(key), "piezas encimadas");
      owner.set(key, idx);
      cells.push([gx, gy]);
    }
    cellsOf.push(cells);
  });
  // separación: para cada celda, revisar vecinas dentro del radio
  const R = Math.ceil(gapPt / cellPt) + 1;
  owner.forEach((idx, key) => {
    const [x, y] = key.split(",").map(Number);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const o = owner.get((x + dx) + "," + (y + dy));
      if (o === undefined || o === idx) continue;
      const gx = Math.max(0, Math.abs(dx) - 1) * cellPt, gy = Math.max(0, Math.abs(dy) - 1) * cellPt;
      assert(Math.sqrt(gx * gx + gy * gy) >= gapPt - 1e-9, `separación menor a la mínima entre ${idx} y ${o}`);
    }
  });
}

// Flecha tipo "<" gruesa (como el diseño del usuario): vértice a la izquierda.
function chevron(w, h, t) {
  return maskFrom(w, h, (x, y) => {
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    const arm = Math.abs(v - 0.5) * 2; // 0 en el centro, 1 en los bordes
    return u >= arm - t && u <= arm + t * 0.6;
  });
}

function nestCase(mask, n, gridW, opts) {
  const cell = 2 * MM, gap = 3 * MM;
  const ker = Nest.kernel(gap, cell);
  const shape = Nest.prepareShape(mask, ker, opts.rotate);
  const items = Array.from({ length: n }, (_, i) => ({ id: i, shape }));
  const res = Nest.pack(items, { gridW, gridH: opts.gridH || 5000, quality: opts.quality || "normal" });
  const byId = {};
  items.forEach((it) => { byId[it.id] = { mask }; });
  checkPlacements(res.placed, byId, gridW, opts.gridH || 5000, gap, cell);
  return res;
}

test("forma real: flechas encajan mejor que sus rectángulos", () => {
  const m = chevron(50, 125, 0.22); // 10 x 25 cm aprox. en celdas de 2 mm
  const gridW = 290; // 58 cm
  const shape = nestCase(m, 20, gridW, { rotate: true });
  // referencia: mismas piezas como rectángulos llenos
  const rect = nestCase(Nest.fullMask(50, 125), 20, gridW, { rotate: true });
  assert.strictEqual(shape.unplaced.length, 0);
  console.log(`    largo por forma: ${(shape.usedH * 2 / 10).toFixed(1)} cm vs rectángulos: ${(rect.usedH * 2 / 10).toFixed(1)} cm`);
  assert(shape.usedH < rect.usedH * 0.8, "debería ahorrar al menos 20 %");
});

test("forma real: dos copias en columna se intercalan (180°)", () => {
  const m = chevron(50, 125, 0.22);
  const res = nestCase(m, 2, 56, { rotate: true }); // hoja tan angosta que solo cabe una de ancho
  assert.strictEqual(res.unplaced.length, 0);
  const ks = res.placed.map((p) => p.k).sort();
  assert(res.usedH < 2 * 125, "deben traslaparse sus rectángulos: " + res.usedH);
  console.log(`    giros: ${ks.join(", ")}; alto ${res.usedH} celdas (2 rectángulos = ${2 * 125 + 2})`);
});

test("forma real: sin rotación solo usa 0°", () => {
  const res = nestCase(chevron(30, 60, 0.25), 8, 120, { rotate: false });
  res.placed.forEach((p) => assert.strictEqual(p.k, 0));
});

test("forma real: hoja fija con piezas que no caben", () => {
  const res = nestCase(Nest.fullMask(40, 40), 10, 90, { rotate: true, gridH: 90 });
  assert.strictEqual(res.placed.length, 4);
  assert.strictEqual(res.unplaced.length, 6);
});

test("forma real: varias hojas", () => {
  const ker = Nest.kernel(3 * MM, 2 * MM);
  const shape = Nest.prepareShape(chevron(50, 125, 0.22), ker, true);
  const items = Array.from({ length: 40 }, (_, i) => ({ id: i, shape }));
  const res = Nest.packSheets(items, { gridW: 290, gridH: 500, quality: "fast" });
  const total = res.sheets.reduce((s, sh) => s + sh.placed.length, 0);
  assert.strictEqual(total + res.unplaced.length, 40);
  assert.strictEqual(res.unplaced.length, 0);
  res.sheets.forEach((sh) => assert(sh.usedH <= 500));
  console.log(`    ${res.sheets.length} hojas`);
});

test("rendimiento: 100 piezas mixtas", () => {
  const ker = Nest.kernel(3 * MM, 2 * MM);
  const shapes = [
    Nest.prepareShape(chevron(50, 125, 0.22), ker, true),
    Nest.prepareShape(maskFrom(40, 40, (x, y) => (x - 20) ** 2 + (y - 20) ** 2 < 400), ker, true),
    Nest.prepareShape(maskFrom(60, 30, (x, y) => y < 8 || x < 8), ker, true),
  ];
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, shape: shapes[i % 3] }));
  const res = Nest.pack(items, { gridW: 290, gridH: 3000, quality: "normal" });
  assert.strictEqual(res.unplaced.length, 0);
  console.log(`    largo ${(res.usedH * 2 / 10).toFixed(1)} cm`);
});

console.log(`\n${passed} pruebas de forma OK`);
