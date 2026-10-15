// Pruebas del motor de acomodo. Extrae la sección PACKER del .jsx y la ejecuta en Node.
// Uso: node test/packer.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "AutoSort-Gangsheet.jsx"), "utf8");
const start = src.indexOf("// === PACKER START ===");
const end = src.indexOf("// === PACKER END ===");
const Packer = new Function(src.slice(start, end) + "\nreturn Packer;")();
const uStart = src.indexOf("// === UTILS START ===");
const uEnd = src.indexOf("// === UTILS END ===");
const Utils = new Function(src.slice(uStart, uEnd) + "\nreturn Utils;")();

const MM = 2.834645669;
const EPS = 1e-3;

function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function randomItems(n, seed, minMm, maxMm) {
  const r = rng(seed);
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({
      id: i,
      w: (minMm + r() * (maxMm - minMm)) * MM,
      h: (minMm + r() * (maxMm - minMm)) * MM,
    });
  }
  return items;
}

function verify(items, res, opts, sheetH) {
  const byId = {};
  items.forEach((it) => (byId[it.id] = it));
  const seen = new Set();
  for (const p of res.placements) {
    assert(!seen.has(p.id), "pieza duplicada " + p.id);
    seen.add(p.id);
    const it = byId[p.id];
    // Tamaño intacto (solo intercambio por rotación)
    const ok = p.rotated
      ? Math.abs(p.w - it.h) < EPS && Math.abs(p.h - it.w) < EPS
      : Math.abs(p.w - it.w) < EPS && Math.abs(p.h - it.h) < EPS;
    assert(ok, "tamaño alterado en pieza " + p.id);
    if (!opts.allowRotate) assert(!p.rotated, "rotó sin permiso");
    // Dentro de la hoja, respetando margen
    assert(p.x >= opts.margin - EPS && p.y >= opts.margin - EPS, "fuera del margen");
    assert(p.x + p.w <= opts.width - opts.margin + EPS, "excede el ancho");
    assert(p.y + p.h <= sheetH - opts.margin + EPS, "excede el alto");
  }
  for (const id of res.unplaced) assert(!seen.has(id), "pieza colocada y no colocada");
  assert.strictEqual(seen.size + res.unplaced.length, items.length, "faltan piezas");
  // Sin solapes y con la separación mínima
  const ps = res.placements;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const sepX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const sepY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      assert(Math.max(sepX, sepY) >= opts.gap - EPS, `piezas ${a.id} y ${b.id} a menos de la separación`);
    }
  }
}

function usage(items, res, w, h) {
  const area = res.placements.reduce((s, p) => s + p.w * p.h, 0);
  return ((area / (w * h)) * 100).toFixed(1) + "%";
}

let passed = 0;
function test(name, fn) {
  const t = Date.now();
  fn();
  passed++;
  console.log(`ok - ${name} (${Date.now() - t} ms)`);
}

for (const quality of ["fast", "normal", "best"]) {
  for (const allowRotate of [false, true]) {
    test(`rollo 58cm, 60 piezas, calidad=${quality}, rotar=${allowRotate}`, () => {
      const items = randomItems(60, 7, 30, 250);
      const opts = { width: 580 * MM, gap: 3 * MM, margin: 3 * MM, allowRotate, quality };
      const res = Packer.packStrip(items, opts);
      verify(items, res, opts, res.height);
      assert.strictEqual(res.unplaced.length, 0);
      console.log(`    largo ${(res.height / MM / 10).toFixed(1)} cm, uso ${usage(items, res, opts.width, res.height)}`);
    });
  }
}

test("rollo: pieza más ancha que la hoja pero cabe girada", () => {
  const items = [{ id: 0, w: 600 * MM, h: 100 * MM }, { id: 1, w: 50 * MM, h: 50 * MM }];
  const opts = { width: 580 * MM, gap: 3 * MM, margin: 3 * MM, allowRotate: true, quality: "normal" };
  const res = Packer.packStrip(items, opts);
  verify(items, res, opts, res.height);
  assert.strictEqual(res.unplaced.length, 0);
  assert(res.placements.find((p) => p.id === 0).rotated);
});

test("rollo: pieza que no cabe de ninguna forma queda fuera", () => {
  const items = [{ id: 0, w: 700 * MM, h: 700 * MM }, { id: 1, w: 50 * MM, h: 50 * MM }];
  const opts = { width: 580 * MM, gap: 3 * MM, margin: 3 * MM, allowRotate: true, quality: "fast" };
  const res = Packer.packStrip(items, opts);
  verify(items, res, opts, res.height);
  assert.deepStrictEqual(res.unplaced, [0]);
});

test("rollo: piezas idénticas llenan filas completas", () => {
  // 10 x 10 cm con 3 mm de separación y margen: en 58 cm caben 5 por fila.
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i, w: 100 * MM, h: 100 * MM }));
  const opts = { width: 580 * MM, gap: 3 * MM, margin: 3 * MM, allowRotate: true, quality: "normal" };
  const res = Packer.packStrip(items, opts);
  verify(items, res, opts, res.height);
  const expected = 4 * 100 + 3 * 3 + 2 * 3; // 4 filas
  assert(Math.abs(res.height / MM - expected) < 0.01, "largo " + res.height / MM);
});

for (const allowRotate of [false, true]) {
  test(`mesa fija 50x70cm con exceso de piezas, rotar=${allowRotate}`, () => {
    const items = randomItems(120, 3, 30, 180);
    const opts = { width: 500 * MM, height: 700 * MM, gap: 3 * MM, margin: 5 * MM, allowRotate, quality: "normal" };
    const res = Packer.packFixed(items, opts);
    verify(items, res, opts, opts.height);
    assert(res.unplaced.length > 0);
    console.log(`    colocadas ${res.placements.length}/${items.length}, uso ${usage(items, res, opts.width, opts.height)}`);
  });
}

test("rendimiento: 250 piezas, calidad normal", () => {
  const items = randomItems(250, 11, 20, 150);
  const opts = { width: 560 * MM, gap: 3 * MM, margin: 3 * MM, allowRotate: true, quality: "normal" };
  const res = Packer.packStrip(items, opts);
  verify(items, res, opts, res.height);
  console.log(`    largo ${(res.height / MM / 10).toFixed(1)} cm, uso ${usage(items, res, opts.width, res.height)}`);
});

// ------------------------------- Utilidades -------------------------------
test("parseList: separadores y decimales con coma", () => {
  assert.deepStrictEqual(Utils.parseList("100; 50 150, 200"), [50, 100, 150, 200]);
  assert.deepStrictEqual(Utils.parseList("60,5; 24"), [24, 60.5]);
  assert.deepStrictEqual(Utils.parseList("  ; abc; -3; 0 "), []);
});

test("qtyFromName", () => {
  assert.strictEqual(Utils.qtyFromName("Logo x10"), 10);
  assert.strictEqual(Utils.qtyFromName("Logo \u00D7 3"), 3);
  assert.strictEqual(Utils.qtyFromName("Logo X2"), 2);
  assert.strictEqual(Utils.qtyFromName("Logo"), 1);
  assert.strictEqual(Utils.qtyFromName("box"), 1);
  assert.strictEqual(Utils.qtyFromName(""), 1);
});

test("pickLength: exacto, redondeado y estándar", () => {
  const cm = 10 * MM;
  assert.strictEqual(Utils.pickLength(123.4 * cm, 0, [], cm).length, 123.4 * cm);
  assert(Math.abs(Utils.pickLength(123.4 * cm, 1, [], cm).length - 124 * cm) < 1e-6);
  assert(Math.abs(Utils.pickLength(100 * cm, 1, [], cm).length - 100 * cm) < 1e-6);
  const std = [50, 100, 150].map((v) => v * cm);
  const r = Utils.pickLength(101 * cm, 2, std, cm);
  assert(r.standard && r.length === 150 * cm);
  const big = Utils.pickLength(170.2 * cm, 2, std, cm);
  assert(!big.standard && big.exceeded && Math.abs(big.length - 171 * cm) < 1e-6);
});

test("cost", () => {
  assert(Math.abs(Utils.cost(2834.645669 * 2.5, 100, 2834.645669) - 250) < 1e-9);
});

test("notas de talla: leer y escribir sin perder el texto del usuario", () => {
  assert.strictEqual(Utils.labelFromNote(""), "");
  const n1 = Utils.noteWithLabel("Cliente Ana", "M");
  assert.strictEqual(Utils.labelFromNote(n1), "M");
  assert(n1.indexOf("Cliente Ana") === 0);
  const n2 = Utils.noteWithLabel(n1, "2XL");
  assert.strictEqual(Utils.labelFromNote(n2), "2XL");
  assert.strictEqual(n2.split("\r").length, 2);
  assert.strictEqual(Utils.noteWithLabel(n2, ""), "Cliente Ana");
});

test("labeledSize y labelSlots", () => {
  assert.deepStrictEqual(Utils.labeledSize(100, 50, 0, 0, 4), { w: 100, h: 50 });
  assert.deepStrictEqual(Utils.labeledSize(100, 50, 20, 8, 4), { w: 100, h: 62 });
  assert.deepStrictEqual(Utils.labeledSize(10, 50, 20, 8, 4), { w: 20, h: 62 });
  // Sin girar: etiqueta debajo
  let s = Utils.labelSlots({ x: 5, y: 7, w: 100, h: 62, rotated: false }, 100, 50, 20, 8, 4, "cw");
  assert.deepStrictEqual(s.design, { x: 5, y: 7, w: 100, h: 50 });
  assert.deepStrictEqual(s.label, { x: 5, y: 61, w: 100, h: 8 });
  // Girada horario: etiqueta a la izquierda
  s = Utils.labelSlots({ x: 5, y: 7, w: 62, h: 100, rotated: true }, 100, 50, 20, 8, 4, "cw");
  assert.deepStrictEqual(s.label, { x: 5, y: 7, w: 8, h: 100 });
  assert.deepStrictEqual(s.design, { x: 17, y: 7, w: 50, h: 100 });
  // Girada antihorario: etiqueta a la derecha
  s = Utils.labelSlots({ x: 5, y: 7, w: 62, h: 100, rotated: true }, 100, 50, 20, 8, 4, "ccw");
  assert.deepStrictEqual(s.design, { x: 5, y: 7, w: 50, h: 100 });
  assert.deepStrictEqual(s.label, { x: 59, y: 7, w: 8, h: 100 });
});

test("rollo con copias etiquetadas: diseño y etiqueta caben en su rectángulo", () => {
  const items = [];
  const gap = 3 * MM, off = 1.5 * MM;
  const designs = randomItems(15, 21, 40, 200);
  designs.forEach((d) => {
    for (let c = 0; c < 3; c++) {
      const sz = Utils.labeledSize(d.w, d.h, 10, 7, off);
      items.push({ id: items.length, w: sz.w, h: sz.h, d });
    }
  });
  const opts = { width: 580 * MM, gap, margin: gap, allowRotate: true, quality: "normal" };
  const res = Packer.packStrip(items, opts);
  verify(items, res, opts, res.height);
  for (const p of res.placements) {
    const d = items[p.id].d;
    const s = Utils.labelSlots(p, d.w, d.h, 10, 7, off, "cw");
    const dw = p.rotated ? d.h : d.w, dh = p.rotated ? d.w : d.h;
    assert(s.design.w >= dw - EPS && s.design.h >= dh - EPS, "el diseño no cabe en su hueco");
    for (const r of [s.design, s.label]) {
      assert(r.x >= p.x - EPS && r.y >= p.y - EPS && r.x + r.w <= p.x + p.w + EPS && r.y + r.h <= p.y + p.h + EPS);
    }
  }
});

console.log(`\n${passed} pruebas OK`);
