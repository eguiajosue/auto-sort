// Simulación mínima del DOM de Illustrator y de ScriptUI para ejecutar el
// script completo en Node. Solo cubre lo que usa AutoSort-Gangsheet.jsx.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const CANVAS = 8191.5; // el lienzo va de -CANVAS a +CANVAS en ambos ejes

function insideCanvas(r) {
  return r[0] >= -CANVAS && r[2] <= CANVAS && r[1] <= CANVAS && r[3] >= -CANVAS && r[2] > r[0] && r[1] > r[3];
}

function canvasError() {
  const e = new Error("an Illustrator error occurred: 1095724867 ('AOoC')");
  e.number = 1200;
  return e;
}

// ------------------------------------------------------------------ DOM ---
// ¿El punto (X, Y) del documento cae dentro de la silueta del objeto?
// _shape(u, v) usa coordenadas normalizadas del objeto SIN girar (v hacia abajo).
function containsPoint(it, X, Y) {
  const b = it.visibleBounds;
  if (X < b[0] || X > b[2] || Y > b[1] || Y < b[3]) return false;
  if (!it._shape) return true;
  const W = b[2] - b[0], H = b[1] - b[3];
  let dx = X - (b[0] + b[2]) / 2, dy = (b[1] + b[3]) / 2 - Y; // pantalla: Y abajo
  // deshacer el giro (k veces 90° antihorario => aplicar 4-k)
  let k = (4 - Math.round((it._rot || 0) / 90) % 4) % 4;
  while (k--) { const t = dx; dx = dy; dy = 0 - t; }
  const k0 = Math.round((it._rot || 0) / 90) % 2;
  const w0 = k0 ? H : W, h0 = k0 ? W : H;
  return it._shape(dx / w0 + 0.5, dy / h0 + 0.5);
}

function encodePngRGBA(w, h, pixelAt) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const px = pixelAt(x, y);
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = px[3];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]); // CRC no se valida
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const memFiles = new Map();
function createDocument(opts) {
  const doc = {
    typename: "Document",
    name: "prueba.ai",
    path: "",
    documentColorSpace: "RGB",
    activeView: { centerPoint: [0, 0], zoom: 1 },
    _items: [],
    activate() { if (doc._app) doc._app.activeDocument = doc; },
    close() { doc._closed = true; if (doc._app) doc._app.documents.splice(doc._app.documents.indexOf(doc), 1); },
    get textFrames() { return doc._items.filter((it) => !it._removed && it.typename === "TextFrame"); },
    saveAs(file, o) {
      const items = doc._items.filter((it) => !it._removed);
      const ab = doc.artboards[0].artboardRect;
      memFiles.set(file.fsName, JSON.stringify({
        kind: o.kind, artboard: ab, outlined: !doc.textFrames.length,
        items: items.map((it) => ({ type: it.typename, b: it.visibleBounds })),
      }));
    },
    // Dibuja lo visible: las imágenes vinculadas (PlacedItem) NO se dibujan
    // en la captura, como sospechamos que pasa en Illustrator; al
    // incrustarlas (RasterItem) sí. _bg = imagen opaca con fondo blanco.
    _render(file, rect, res, skipPlaced) {
      const w = Math.max(1, Math.round((rect[2] - rect[0]) / 72 * res));
      const h = Math.max(1, Math.round((rect[1] - rect[3]) / 72 * res));
      const items = doc._items.filter((it) => !it._removed && !it.hidden && !(skipPlaced && it.typename === "PlacedItem"));
      const png = encodePngRGBA(w, h, (x, y) => {
        const X = rect[0] + (x + 0.5) * 72 / res, Y = rect[1] - (y + 0.5) * 72 / res;
        for (const it of items) {
          if (containsPoint(it, X, Y)) return it._bg ? [25, 25, 25, 255] : [255, 255, 255, 255];
          const b = it.visibleBounds;
          if (it._bg && X >= b[0] && X <= b[2] && Y <= b[1] && Y >= b[3]) return [253, 253, 253, 255];
        }
        return [0, 0, 0, 0];
      });
      memFiles.set(file.fsName, png.toString("latin1"));
    },
    imageCapture(file, rect, o) {
      if (doc._app && doc._app._captureThrows) throw new Error("imageCapture falló");
      doc._render(file, rect, o.resolution, true);
    },
    exportFile(file, type, o) {
      if (doc._app && doc._app._exportThrows) throw new Error("exportFile falló");
      doc._render(file, doc.artboards[0].artboardRect, o.horizontalScale / 100 * 72, false);
    },
  };

  function makeArtboard(rect, name) {
    let r = rect.slice();
    return {
      name: name || "Mesa de trabajo 1",
      get artboardRect() { return r.slice(); },
      set artboardRect(v) {
        if (!insideCanvas(v)) throw canvasError();
        r = v.slice();
      },
    };
  }

  const artboards = [makeArtboard(opts.artboard)];
  let active = 0;
  artboards.getActiveArtboardIndex = () => active;
  artboards.setActiveArtboardIndex = (i) => { active = i; };
  artboards.add = (rect) => {
    if (!insideCanvas(rect)) throw canvasError();
    const a = makeArtboard(rect, "Mesa de trabajo " + (artboards.length + 1));
    artboards.push(a);
    return a;
  };
  artboards.remove = (i) => { artboards.splice(i, 1); };
  doc.artboards = artboards;

  const layers = [];
  layers.getByName = (n) => {
    const l = layers.find((x) => x.name === n);
    if (!l) throw new Error("No such element");
    return l;
  };
  layers.add = () => {
    const l = makeLayer(doc, "Capa " + (layers.length + 1));
    layers.unshift(l);
    return l;
  };
  doc.layers = layers;

  Object.defineProperty(doc, "selection", {
    get() { return doc._items.filter((it) => it.selected && !it._removed); },
    set(v) { if (!v) doc._items.forEach((it) => { it.selected = false; }); },
  });
  return doc;
}

function makeLayer(doc, name) {
  const layer = {
    typename: "Layer", name, locked: false, visible: true, parent: doc,
    pageItems: [], layers: [],
    zOrder() { },
    remove() { doc.layers.splice(doc.layers.indexOf(layer), 1); },
  };
  layer.textFrames = { add: () => addText(doc, layer) };
  return layer;
}

let uuidSeq = 0;
function baseItem(doc, layer, typename, bounds) {
  const it = {
    uuid: "u" + (++uuidSeq),
    typename, parent: layer, locked: false, hidden: false, guides: false, selected: false,
    name: "", note: "", stroked: false, clipping: false, _b: bounds.slice(),
    matrix: { mValueA: 1, mValueB: 0 },
    get visibleBounds() { return this._b.slice(); },
    get geometricBounds() { return this._b.slice(); },
    translate(dx, dy) {
      const nb = [this._b[0] + dx, this._b[1] + dy, this._b[2] + dx, this._b[3] + dy];
      if (!insideCanvas(nb)) throw canvasError();
      this._b = nb;
    },
    createOutline() { this.typename = "GroupItem"; return this; },
    embed() { if (this.typename === "PlacedItem") this.typename = "RasterItem"; },
    rotate(angle) {
      const b = this._b, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      const w = b[2] - b[0], h = b[1] - b[3];
      if (Math.abs(angle) % 180 === 90) this._b = [cx - h / 2, cy + w / 2, cx + h / 2, cy - w / 2];
      this._rot = ((this._rot || 0) + angle + 360) % 360;
    },
    duplicate(target) {
      const tl = target && target.typename === "Layer" ? target : layer;
      const d = baseItem(tl.parent, tl, typename, this._b);
      d.name = this.name; d.note = this.note; d._src = this._src || this;
      d._rot = this._rot; d._shape = this._shape; d._bg = this._bg; d.file = this.file;
      if (typename === "TextFrame") { d.contents = this.contents; d._b = this._b; }
      tl.pageItems.unshift(d);
      return d;
    },
    remove() {
      this._removed = true;
      layer.pageItems.splice(layer.pageItems.indexOf(this), 1);
    },
  };
  doc._items.push(it);
  return it;
}

// Imagen vinculada (como un PNG colocado con Archivo > Colocar).
function addPlaced(doc, layer, bounds, name) {
  const it = baseItem(doc, layer, "PlacedItem", bounds);
  it.name = "";
  it.file = { name: name, exists: true };
  it.matrix = { mValueA: 0.24, mValueB: 0 }; // 300 ppi
  layer.pageItems.push(it);
  return it;
}

function addPath(doc, layer, bounds, name) {
  const it = baseItem(doc, layer, "PathItem", bounds);
  it.name = name || "";
  layer.pageItems.push(it);
  return it;
}

function addText(doc, layer) {
  const it = baseItem(doc, layer, "TextFrame", [0, 0, 1, -1]);
  const ca = { size: 12 };
  it.textRange = { characterAttributes: ca };
  let contents = "";
  Object.defineProperty(it, "contents", {
    get() { return contents; },
    set(v) { contents = v; },
  });
  // Tamaño dinámico según texto y tamaño de letra (sin girar).
  Object.defineProperty(it, "_b", {
    get() {
      const w = Math.max(1, contents.length * ca.size * 0.6), h = ca.size * 1.2;
      const o = this._o || [0, 0];
      const rot = (this._rot || 0) % 180 === 90;
      return rot ? [o[0], o[1], o[0] + h, o[1] - w] : [o[0], o[1], o[0] + w, o[1] - h];
    },
    set(v) { this._o = [v[0], v[1]]; },
  });
  it.rotate = function (angle) {
    const b = this._b, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    this._rot = ((this._rot || 0) + angle + 360) % 360;
    const w = this._b[2] - this._b[0], h = this._b[1] - this._b[3];
    this._o = [cx - w / 2, cy + h / 2];
  };
  layer.pageItems.push(it);
  return it;
}

// ------------------------------------------------------------- ScriptUI ---
function makeScriptUI(onShow, toArr) {
  const windows = [];
  function control(type, text, props, win) {
    const c = {
      type, text: text === undefined ? "" : text, value: false, enabled: true, characters: 0,
      preferredSize: { width: 0, height: 0 }, children: [], window: win, props: props || {},
      add(t, bounds, txt, pr) {
        let ch;
        if (c.type === "dropdownlist" && t === "item") {
          ch = { text: typeof bounds === "string" ? bounds : txt, index: c.items.length };
          c.items.push(ch);
          return ch;
        }
        if (c.type === "listbox" && t === "item") {
          ch = { text: typeof bounds === "string" ? bounds : txt, index: c.items.length, selected: false, subItems: [{ text: "" }, { text: "" }, { text: "" }] };
          c.items.push(ch);
          return ch;
        }
        ch = control(t, typeof txt === "string" ? txt : "", pr, c.window);
        if (Array.isArray(txt)) {
          ch.items = txt.map((x, i) => ({ text: x, index: i }));
        } else if (t === "listbox") {
          ch.items = [];
        }
        c.children.push(ch);
        c.window._all.push(ch);
        return ch;
      },
    };
    if (type === "dropdownlist") {
      let sel = null;
      c.removeAll = () => { c.items = []; sel = null; };
      Object.defineProperty(c, "selection", {
        get() { return sel; },
        set(v) { sel = typeof v === "number" ? c.items[v] : v; },
      });
    }
    if (type === "listbox") {
      c.items = [];
      c.removeAll = () => { c.items = []; };
      Object.defineProperty(c, "selection", {
        get() {
          const s = c.items.filter((x) => x.selected);
          return s.length ? toArr(s) : null;
        },
        set(v) { c.items.forEach((x) => { x.selected = false; }); },
      });
    }
    return c;
  }

  function Window(type, title) {
    const w = control("window", title, {}, null);
    w.window = w;
    w._all = [];
    w.title = title;
    w.kind = type;
    w._result = 2;
    w.show = function () {
      windows.push(w);
      if (type === "palette") return undefined;
      onShow(w, helpers(w));
      return w._result;
    };
    w.close = function (r) { w._result = r === undefined ? 2 : r; };
    w.update = function () { };
    return w;
  }

  function helpers(w) {
    const find = (type, text) => {
      const c = w._all.find((x) => x.type === type && (text === undefined || String(x.text).indexOf(text) === 0));
      if (!c) throw new Error(`control ${type} "${text}" no encontrado en "${w.title}"`);
      return c;
    };
    const editAfter = (labelText, nth) => {
      let i = w._all.findIndex((x) => x.type === "statictext" && String(x.text) === labelText);
      if (i < 0) i = w._all.findIndex((x) => x.type === "statictext" && String(x.text).indexOf(labelText) >= 0);
      if (i < 0) throw new Error("etiqueta no encontrada: " + labelText);
      return w._all.slice(i).filter((x) => x.type === "edittext")[nth || 0];
    };
    return {
      find, editAfter, all: () => w._all,
      click: (text) => {
        const b = find("button", text);
        if (b.onClick) b.onClick();
        else if (b.props.name === "cancel") w.close(2); // como ScriptUI
        else if (b.props.name === "ok") w.close(1);
      },
      check: (text, v) => { const c = find("checkbox", text); c.value = v; if (c.onClick) c.onClick(); },
      radio: (text) => { const r = find("radiobutton", text); r.value = true; if (r.onClick) r.onClick(); },
      list: () => find("listbox"),
      selectRows: (idx) => {
        const lb = find("listbox");
        lb.items.forEach((x, i) => { x.selected = idx.indexOf(i) >= 0; });
        if (lb.onChange) lb.onChange();
      },
    };
  }
  return { Window, windows };
}

// ------------------------------------------------------------- Ejecutar ---
function runScript({ doc, onShow, outFolder, captureThrows, exportThrows }) {
  const opts = { outFolder };
  const src = fs.readFileSync(path.join(__dirname, "..", "AutoSort-Gangsheet.jsx"), "utf8").replace(/^﻿/, "");
  const alerts = [];
  const sandbox = {};
  vm.createContext(sandbox);
  const SArray = vm.runInContext("Array", sandbox);
  const ui = makeScriptUI(onShow, (a) => SArray.from(a));
  const app = {
    documents: [doc],
    activeDocument: doc,
    _docOpts: null,
    textFonts: { getByName() { throw new Error("no font"); } },
    redraw() { app.redraws = (app.redraws || 0) + 1; },
  };
  doc._app = app;
  app._captureThrows = !!captureThrows;
  app._exportThrows = !!exportThrows;
  app.documents.add = () => {
    const d = createDocument({ artboard: [0, 0, 612, -792] });
    d.layers.push(makeLayer(d, "Capa 1"));
    d._app = app;
    app.documents.push(d);
    app.activeDocument = d;
    return d;
  };
  // Archivos en memoria (para la captura de siluetas).
  const fakeFile = (p) => {
    const f = {
      fsName: String(p), name: String(p).split("/").pop(), parent: null, encoding: "UTF-8",
      get exists() { return memFiles.has(f.fsName); },
      _buf: null,
      open: (mode) => { if (mode === "w") { f._buf = ""; return true; } return memFiles.has(f.fsName); },
      read: () => memFiles.get(f.fsName),
      write: (t) => { f._buf += t; },
      close: () => { if (f._buf !== null) { memFiles.set(f.fsName, f._buf); f._buf = null; } },
      remove: () => memFiles.delete(f.fsName),
    };
    return f;
  };
  Object.assign(sandbox, {
    app, alert: (m) => alerts.push(String(m)),
    Window: ui.Window,
    File: fakeFile,
    Folder: Object.assign(() => ({ exists: false }), {
      userData: "/tmp", temp: "/mem",
      selectDialog: () => (opts.outFolder ? { fsName: opts.outFolder, exists: true } : null),
    }),
    EPSSaveOptions: function () { this.kind = "eps"; },
    ExportOptionsPNG24: function () { },
    ExportType: { PNG24: "PNG24" },
    ElementPlacement: { PLACEATEND: "PLACEATEND" },
    SaveOptions: { DONOTSAVECHANGES: "NO" },
    ImageCaptureOptions: function () { },
    DocumentColorSpace: { RGB: "RGB", CMYK: "CMYK" },
    RGBColor: function () { }, CMYKColor: function () { },
    Transformation: { CENTER: "CENTER" },
    ZOrderMethod: { BRINGTOFRONT: 1 },
  });
  vm.runInContext(src, sandbox, { filename: "AutoSort-Gangsheet.jsx" });
  return { alerts, windows: ui.windows, app };
}

module.exports = { createDocument, makeLayer, addPath, addPlaced, runScript, insideCanvas, containsPoint, CANVAS, memFiles };
