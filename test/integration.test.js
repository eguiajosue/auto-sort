// Ejecuta AutoSort-Gangsheet.jsx completo contra una simulación de Illustrator.
// Uso: node test/integration.test.js
"use strict";
const assert = require("assert");
const { createDocument, makeLayer, addPath, runScript, insideCanvas, containsPoint, memFiles } = require("./illustrator-mock");

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
function mainDialog(h, { qty, multi, maxLen, mode, sizes, shape, width }) {
  h.find("dropdownlist").selection = 0; // mm
  h.find("dropdownlist").onChange();
  if (mode === "fixed") h.radio("Mesa de trabajo actual");
  else h.radio("Ancho fijo");
  h.editAfter("Ancho de la hoja").text = String(width || 580);
  if (shape) {
    const ddm = h.all().find((c) => c.type === "dropdownlist" && c.items && c.items[0].text.indexOf("Rectángulos") === 0);
    ddm.selection = 1;
    if (ddm.onChange) ddm.onChange();
  }
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
    h.editAfter("Copias:").text = String(qty);
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

// ------------------------------------------------------- Forma real ---
// Flecha "<" gruesa como el diseño del usuario (u, v normalizados, v hacia abajo).
const chevronShape = (u, v) => {
  const arm = Math.abs(v - 0.5) * 2;
  return u >= arm - 0.22 && u <= arm + 0.13;
};

function setupChevron() {
  const s = setup();
  s.item._shape = chevronShape;
  return s;
}

// Muestrea cada 1 mm: ninguna silueta se encima y la separación entre
// siluetas distintas es al menos gap (con tolerancia de muestreo).
function assertShapesApart(doc, items, gapMm) {
  const step = 1 * MM;
  const pts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  items.forEach((it) => {
    const b = it.visibleBounds;
    minX = Math.min(minX, b[0]); maxX = Math.max(maxX, b[2]); minY = Math.min(minY, b[3]); maxY = Math.max(maxY, b[1]);
  });
  const cells = new Map();
  items.forEach((it, idx) => {
    const b = it.visibleBounds;
    for (let X = Math.ceil(b[0] / step) * step; X <= b[2]; X += step) {
      for (let Y = Math.floor(b[1] / step) * step; Y >= b[3]; Y -= step) {
        if (!containsPoint(it, X, Y)) continue;
        const key = Math.round(X / step) + "," + Math.round(Y / step);
        const o = cells.get(key);
        assert(o === undefined || o === idx, `siluetas ${o} y ${idx} encimadas`);
        cells.set(key, idx);
      }
    }
  });
  const R = Math.ceil(gapMm) - 2; // tolerancia: 2 mm de muestreo/celda
  cells.forEach((idx, key) => {
    const [x, y] = key.split(",").map(Number);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
      if (dx * dx + dy * dy > R * R) continue;
      const o = cells.get((x + dx) + "," + (y + dy));
      assert(o === undefined || o === idx, `siluetas ${idx} y ${o} a menos de la separación`);
    }
  });
}

test("forma real: 2 copias en hoja angosta se intercalan girando 180°", () => {
  const { doc } = setupChevron();
  const { alerts } = runScript({ doc, onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 2, shape: true, width: 115 }); } });
  const msg = alerts[alerts.length - 1];
  assert(/Piezas acomodadas: 2 de 2/.test(msg), msg);
  assert(/forma real/.test(msg), msg);
  const ds = designs(doc);
  const rots = ds.map((d) => d._rot || 0).sort((a, b) => a - b);
  const ab = doc.artboards[0].artboardRect;
  const hMm = (ab[1] - ab[3]) / MM;
  console.log(`    giros: ${rots.join("°, ")}°; largo ${hMm.toFixed(1)} mm (rectángulos: ${(2 * 250.48 + 3 + 6).toFixed(1)} mm)`);
  assert(hMm < 2 * 250.48, "deben intercalarse");
  ds.forEach((d) => assert(within(d.visibleBounds, ab), "fuera de la hoja"));
  assertShapesApart(doc, ds, 3);
});

test("forma real: 20 copias en rollo de 580 mm usan menos largo que rectángulos", () => {
  const run = (shape) => {
    const { doc } = setupChevron();
    const { alerts } = runScript({ doc, onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") mainDialog(h, { qty: 20, shape }); } });
    const ab = doc.artboards[0].artboardRect;
    assert(/Piezas acomodadas: 20 de 20/.test(alerts[alerts.length - 1]), alerts[alerts.length - 1]);
    designs(doc).forEach((d) => assert(within(d.visibleBounds, ab), "fuera de la hoja"));
    return { doc, len: (ab[1] - ab[3]) / MM };
  };
  const shape = run(true), rect = run(false);
  console.log(`    largo: forma ${(shape.len / 10).toFixed(1)} cm vs rectángulos ${(rect.len / 10).toFixed(1)} cm`);
  assert(shape.len < rect.len * 0.8);
  assertShapesApart(shape.doc, designs(shape.doc), 3);
});

test("forma real con tallas y varias hojas", () => {
  const { doc } = setupChevron();
  const { alerts } = runScript({
    doc,
    onShow: (w, h) => {
      if (w.title.indexOf("Tallas") === 0) {
        h.editAfter("M", 0).text = "30";
        h.editAfter("XL", 0).text = "30";
        h.click("Aceptar");
      } else if (w.title === "AutoSort Gangsheet DTF") {
        mainDialog(h, { sizes: true, shape: true, multi: true, maxLen: 1000 });
      }
    },
  });
  const msg = alerts[alerts.length - 1];
  assert(/Piezas acomodadas: 60 de 60/.test(msg), msg);
  assert(doc.artboards.length >= 2, msg);
  const all = designs(doc).concat(labels(doc));
  all.forEach((it) => assert.strictEqual(doc.artboards.filter((a) => within(it.visibleBounds, a.artboardRect)).length, 1, "pieza o etiqueta fuera de hoja"));
  assert.strictEqual(labels(doc).length, 60);
  assertShapesApart(doc, all, 1.5); // etiquetas a 1.5 mm de su diseño
  console.log("    " + msg.split("\n").filter((l) => /^Hoja/.test(l)).join(" | "));
});

// ------------------------------------------- Nuevas funciones (v1.1) ---
function setupTwo() {
  const doc = createDocument({ artboard: [0, 0, 595.28, -841.89] });
  const layer = makeLayer(doc, "Capa 1");
  doc.layers.push(layer);
  const big = addPath(doc, layer, [100, -100, 100 + 150 * MM, -100 - 120 * MM], "Grande");
  const small = addPath(doc, layer, [300, -100, 300 + 40 * MM, -100 - 40 * MM], "Chico");
  big.selected = small.selected = true;
  return { doc, layer, big, small };
}
const named = (doc, n) => designs(doc).filter((d) => d.name === n);

// Diálogo con opciones nuevas.
function dialogV11(h, o) {
  h.find("dropdownlist").selection = 0; h.find("dropdownlist").onChange();
  h.radio(o.fixed ? "Mesa de trabajo actual" : "Ancho fijo");
  h.editAfter("Ancho de la hoja").text = String(o.width || 580);
  h.editAfter("Entre elementos").text = "3";
  h.editAfter("Margen al borde").text = "3";
  if (o.shape) {
    const ddm = h.all().find((c) => c.type === "dropdownlist" && c.items && c.items[0] && c.items[0].text.indexOf("Rectángulos") === 0);
    ddm.selection = 1; ddm.onChange && ddm.onChange();
  }
  // copias por fila (en el orden de la lista)
  (o.qty || []).forEach((q, i) => { h.selectRows([i]); h.editAfter("Copias:").text = String(q); h.click("Asignar copias"); });
  if (o.fill) {
    const dd = h.all().find((c) => c.type === "dropdownlist" && c.items && c.items[0] && c.items[0].text === "(no rellenar)");
    dd.selection = dd.items.findIndex((it) => it.text.indexOf(o.fill) === 0);
    if (o.fillMax) h.editAfter("hasta").text = String(o.fillMax);
  }
  if (o.order) { h.check("Etiqueta del pedido", true); const i = h.all().findIndex((c) => c.type === "checkbox" && c.text.indexOf("Etiqueta del pedido") === 0); h.all().slice(i).find((c) => c.type === "edittext").text = o.order; }
  if (o.csv) h.check("Guardar resumen", true);
  if (o.eps) h.check("Exportar EPS", true);
  h.click("Acomodar");
}
function runV11(doc, o) {
  return runScript({ doc, outFolder: "/out", onShow: (w, h) => { if (w.title === "AutoSort Gangsheet DTF") dialogV11(h, o); } });
}

test("rellenar huecos (rectángulos): agrega copias sin alargar la hoja", () => {
  const a = setupTwo();
  runV11(a.doc, { qty: [3, 0] });
  const lenBase = a.doc.artboards[0].artboardRect[1] - a.doc.artboards[0].artboardRect[3];
  const b = setupTwo();
  const { alerts } = runV11(b.doc, { qty: [3, 0], fill: "Chico" });
  const msg = alerts[alerts.length - 1];
  const ab = b.doc.artboards[0].artboardRect;
  assert(/Relleno: \d+ copia/.test(msg), msg);
  assert(Math.abs((ab[1] - ab[3]) - lenBase) < 0.01, "el relleno no debe alargar la hoja");
  const ds = designs(b.doc);
  assert(named(b.doc, "Chico").length > 0);
  ds.forEach((d) => assert(within(d.visibleBounds, ab), "pieza fuera"));
  assertNoOverlap(ds, 3 * MM);
  console.log(`    ${named(b.doc, "Chico").length} copias de relleno; largo ${(lenBase / MM / 10).toFixed(1)} cm sin cambio`);
});

test("rellenar huecos con tope de copias", () => {
  const b = setupTwo();
  runV11(b.doc, { qty: [3, 0], fill: "Chico", fillMax: 2 });
  assert.strictEqual(named(b.doc, "Chico").length, 2);
});

test("rellenar huecos (forma real)", () => {
  const b = setupTwo();
  b.big._shape = chevronShape;
  runV11(b.doc, { qty: [4, 0], fill: "Chico", shape: true });
  assert(named(b.doc, "Chico").length > 0);
  assertShapesApart(b.doc, designs(b.doc), 3);
});

test("objetos fijos: las piezas rodean lo bloqueado", () => {
  const a = setupTwo();
  // logo fijo bloqueado arriba a la izquierda de la mesa de trabajo
  const fixed = addPath(a.doc, a.layer, [10, -10, 10 + 200 * MM, -10 - 60 * MM], "Logo fijo");
  fixed.locked = true;
  const { alerts } = runV11(a.doc, { qty: [4, 6] });
  const msg = alerts[alerts.length - 1];
  assert(/Objetos fijos respetados: 1/.test(msg), msg);
  assert.deepStrictEqual(fixed.visibleBounds, [10, -10, 10 + 200 * MM, -10 - 60 * MM], "el objeto fijo no se mueve");
  const fb = fixed.visibleBounds;
  designs(a.doc).filter((d) => d !== fixed).forEach((d) => {
    const b = d.visibleBounds;
    const sepX = Math.max(fb[0] - b[2], b[0] - fb[2]), sepY = Math.max(b[3] - fb[1], fb[3] - b[1]);
    assert(Math.max(sepX, sepY) >= 3 * MM - 0.01, "pieza sobre el objeto fijo");
  });
});

test("etiqueta del pedido, resumen CSV y EPS por hoja", () => {
  memFiles.clear();
  const a = setupTwo();
  const { alerts } = runV11(a.doc, { qty: [8, 30], order: "Pedido 123", csv: true, eps: true });
  const msg = alerts[alerts.length - 1];
  // etiqueta del pedido
  const orders = a.doc._items.filter((it) => !it._removed && it.typename === "TextFrame" && it.parent.name === "Datos del pedido");
  assert.strictEqual(orders.length, 1, msg);
  assert(/^Pedido 123 · \d\d\/\d\d\/\d{4} · Hoja 1\/1$/.test(orders[0].contents), orders[0].contents);
  const ob = orders[0].visibleBounds;
  designs(a.doc).forEach((d) => {
    const b = d.visibleBounds;
    const sepX = Math.max(ob[0] - b[2], b[0] - ob[2]), sepY = Math.max(b[3] - ob[1], ob[3] - b[1]);
    assert(Math.max(sepX, sepY) >= 3 * MM - 0.01, "pieza sobre la etiqueta del pedido");
  });
  // CSV
  const csv = memFiles.get("/out/prueba_resumen.csv");
  assert(csv, "no se guardó el CSV: " + msg);
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.strictEqual(lines[0], "Hoja,Diseño,Talla,Copias,Ancho (mm),Largo (mm)");
  const total = lines.slice(1).reduce((t, l) => t + +l.split(",")[3], 0);
  assert.strictEqual(total, 38);
  // EPS
  const epsName = [...memFiles.keys()].find((k) => k.endsWith(".eps"));
  assert(epsName, "no se guardó el EPS: " + msg);
  const eps = JSON.parse(memFiles.get(epsName));
  const ab = a.doc.artboards[0].artboardRect;
  assert.deepStrictEqual(eps.artboard.map((v) => Math.round(v * 100)), Array.from(ab, (v) => Math.round(v * 100)));
  assert(eps.outlined, "los textos deben ir a contornos");
  assert.strictEqual(eps.items.filter((i) => i.type === "PathItem").length, 38);
  console.log("    " + epsName.split("/").pop() + " · " + (lines.length - 1) + " filas de resumen");
});

test("varias hojas: una etiqueta y un EPS por hoja", () => {
  memFiles.clear();
  const a = setupTwo();
  runV11(a.doc, { qty: [40, 0], order: "P-7", eps: true });
  const n = a.doc.artboards.length;
  assert(n >= 1);
  const orders = a.doc._items.filter((it) => !it._removed && it.typename === "TextFrame" && it.parent.name === "Datos del pedido");
  assert.strictEqual(orders.length, n);
  const epsFiles = [...memFiles.keys()].filter((k) => k.endsWith(".eps"));
  assert.strictEqual(epsFiles.length, n);
});

console.log(`\n${passed} pruebas de integración OK`);
