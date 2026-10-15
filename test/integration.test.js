// Ejecuta AutoSort-Gangsheet.jsx completo contra una simulación de Illustrator.
// Uso: node test/integration.test.js
"use strict";
const assert = require("assert");
const { createDocument, makeLayer, addPath, runScript, insideCanvas } = require("./illustrator-mock");

const MM = 2.834645669;
let passed = 0;
function test(name, fn) {
  const t = Date.now();
  fn();
  passed++;
  console.log(`ok - ${name} (${Date.now() - t} ms)`);
}

// Documento A4 con un rectángulo de 100.48 x 250.48 mm (como en la prueba del usuario).
function setup(extra) {
  const doc = createDocument({ artboard: [0, 0, 595.28, -841.89] });
  const layer = makeLayer(doc, "Capa 1");
  doc.layers.push(layer);
  const w = 100.48 * MM, h = 250.48 * MM;
  const item = addPath(doc, layer, [100, -100, 100 + w, -100 - h], "");
  item.selected = true;
  (extra || []).forEach((b) => addPath(doc, layer, b.bounds, b.name).selected = true);
  return { doc, layer, item };
}

function designs(doc) {
  return doc._items.filter((it) => !it._removed && it.typename === "PathItem");
}
function labels(doc) {
  return doc._items.filter((it) => !it._removed && it.typename === "TextFrame");
}

function within(b, r, eps) {
  eps = eps || 0.01;
  return b[0] >= r[0] - eps && b[2] <= r[2] + eps && b[1] <= r[1] + eps && b[3] >= r[3] - eps;
}

function assertNoOverlap(items, gap) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].visibleBounds, b = items[j].visibleBounds;
      const sepX = Math.max(b[0] - a[2], a[0] - b[2]);
      const sepY = Math.max(a[3] - b[1], b[3] - a[1]);
      assert(Math.max(sepX, sepY) >= gap - 0.01, `objetos ${i} y ${j} encimados o muy juntos`);
    }
  }
}

// Llena el diálogo principal: ancho 580 mm, unidades mm, 3 mm de separación.
function mainDialog(h, { qty, multi, maxLen, mode, sizes }) {
  h.find("dropdownlist").selection = 0; // mm
  h.find("dropdownlist").onChange();
  if (mode === "fixed") h.radio("Mesa de trabajo actual");
  else h.radio("Ancho fijo");
  h.editAfter("Ancho de la hoja").text = "580";
  h.editAfter("Entre elementos").text = "3";
  h.editAfter("Margen al borde").text = "3";
  if (multi) {
    h.check("Si no cabe todo", true);
    if (maxLen) h.editAfter("Largo máximo por hoja").text = String(maxLen);
  }
  h.selectRows([0]);
  if (sizes) {
    h.click("Tallas por diseño");
  } else if (qty) {
    h.find("edittext", "1").text = String(qty);
    h.click("Asignar copias");
  }
  h.click("Acomodar");
}

test("85 copias en rollo de 580 mm: sube la mesa de trabajo para caber en el lienzo", () => {
  const { doc } = setup();
  const { alerts } = runScript({ doc, onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 85 }); } });
  const msg = alerts[alerts.length - 1];
  assert(/Piezas acomodadas: 85 de 85/.test(msg), msg);
  const ab = doc.artboards[0].artboardRect;
  assert(insideCanvas(ab));
  assert(Math.abs(ab[2] - ab[0] - 580 * MM) < 0.01, "ancho de la hoja");
  const ds = designs(doc);
  assert.strictEqual(ds.length, 85);
  ds.forEach((d) => assert(within(d.visibleBounds, ab), "pieza fuera de la hoja"));
  assertNoOverlap(ds, 3 * MM);
  assert(/se subió/.test(msg), "debe avisar que subió la mesa");
});

test("200 copias sin 'Varias hojas': avisa y no modifica nada", () => {
  const { doc } = setup();
  const before = doc.artboards[0].artboardRect;
  const { alerts } = runScript({ doc, onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 200 }); } });
  assert(/Varias hojas/.test(alerts[0]), alerts[0]);
  assert.deepStrictEqual(doc.artboards[0].artboardRect, before);
  assert.strictEqual(designs(doc).length, 1);
});

test("200 copias con varias hojas de 300 cm", () => {
  const { doc } = setup();
  const { alerts } = runScript({ doc, onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 200, multi: true, maxLen: 3000 }); } });
  const msg = alerts[alerts.length - 1];
  assert(/Piezas acomodadas: 200 de 200/.test(msg), msg);
  assert(doc.artboards.length >= 4, "hojas creadas: " + doc.artboards.length);
  doc.artboards.forEach((a, i) => {
    const r = a.artboardRect;
    assert(insideCanvas(r));
    assert(r[1] - r[3] <= 3000 * MM + 0.01, "hoja " + i + " más larga que el máximo");
    if (i > 0) assert(a.name.indexOf("Gangsheet - Hoja ") === 0);
  });
  // Cada pieza dentro de exactamente una hoja, sin encimarse.
  const ds = designs(doc);
  assert.strictEqual(ds.length, 200);
  ds.forEach((d) => {
    const n = doc.artboards.filter((a) => within(d.visibleBounds, a.artboardRect)).length;
    assert.strictEqual(n, 1, "pieza fuera de hoja o en dos hojas");
  });
  assertNoOverlap(ds, 3 * MM);
  // Las mesas de trabajo no se enciman.
  for (let i = 0; i < doc.artboards.length; i++) {
    for (let j = i + 1; j < doc.artboards.length; j++) {
      const a = doc.artboards[i].artboardRect, b = doc.artboards[j].artboardRect;
      assert(a[2] <= b[0] || b[2] <= a[0] || a[3] >= b[1] || b[3] >= a[1], "hojas encimadas");
    }
  }
  console.log("    " + msg.split("\n").filter((l) => /^Hoja/.test(l)).join(" | "));
});

test("re-ejecutar con varias hojas reemplaza las hojas anteriores", () => {
  const { doc } = setup();
  const dlg = (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 120, multi: true, maxLen: 2000 }); };
  runScript({ doc, onShow: dlg });
  const n1 = doc.artboards.length;
  // Segunda vez: solo el original seleccionado otra vez.
  doc._items.forEach((it) => { it.selected = false; });
  designs(doc)[0].selected = true;
  const { alerts } = runScript({ doc, onShow: dlg });
  assert.strictEqual(doc.artboards.length, n1, alerts[alerts.length - 1]);
});

test("tallas por diseño: S x3, M x5, XL x2 con etiqueta", () => {
  const { doc } = setup();
  const { alerts, app } = runScript({
    doc,
    onShow: (w, h) => {
      if (w.title.indexOf("Tallas") === 0) {
        h.editAfter("S", 0).text = "3";
        h.editAfter("M", 0).text = "5";
        h.editAfter("XL", 0).text = "2";
        h.click("Aceptar");
      } else if (w.title === "AutoSort Gangsheet DTF") {
        mainDialog(h, { sizes: true });
      }
    },
  });
  const msg = alerts[alerts.length - 1];
  assert(/Piezas acomodadas: 10 de 10/.test(msg), msg);
  assert(/Tallas: .*S ×3.*M ×5.*XL ×2|Tallas: /.test(msg), msg);
  const ls = labels(doc);
  assert.strictEqual(ls.length, 10);
  const counts = {};
  ls.forEach((l) => { counts[l.contents] = (counts[l.contents] || 0) + 1; });
  assert.deepStrictEqual(counts, { S: 3, M: 5, XL: 2 });
  assert(app.redraws > 0, "debe resaltar la pieza en el lienzo");
  const ab = doc.artboards[0].artboardRect;
  labels(doc).concat(designs(doc)).forEach((it) => assert(within(it.visibleBounds, ab)));
  assertNoOverlap(designs(doc), 3 * MM);
  // Notas con la talla
  const notes = designs(doc).map((d) => (/AutoSort talla: (.*)$/.exec(d.note) || [])[1]).sort();
  assert.deepStrictEqual(notes, ["M", "M", "M", "M", "M", "S", "S", "S", "XL", "XL"]);
});

test("mesa fija con varias hojas del mismo tamaño", () => {
  const { doc } = setup();
  const { alerts } = runScript({ doc, onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 9, multi: true, mode: "fixed" }); } });
  const msg = alerts[alerts.length - 1];
  assert(/Piezas acomodadas: 9 de 9/.test(msg), msg);
  // En A4 caben 2 por hoja (rotados o no) -> 5 hojas
  assert(doc.artboards.length >= 3, "hojas: " + doc.artboards.length);
  doc.artboards.forEach((a) => {
    const r = a.artboardRect;
    assert(Math.abs(r[2] - r[0] - 595.28) < 0.01 && Math.abs(r[1] - r[3] - 841.89) < 0.01, "tamaño de hoja");
  });
  designs(doc).forEach((d) => assert.strictEqual(doc.artboards.filter((a) => within(d.visibleBounds, a.artboardRect)).length, 1));
});

test("cancelar restaura la selección y no cambia nada", () => {
  const { doc, item } = setup();
  const { alerts } = runScript({ doc, onShow: (w, h) => { h.selectRows([0]); h.click("Cancelar"); } });
  assert.strictEqual(alerts.length, 0);
  assert(item.selected);
  assert.strictEqual(designs(doc).length, 1);
});

console.log(`\n${passed} pruebas de integración OK`);
