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

console.log(`\n${passed} pruebas OK`);
