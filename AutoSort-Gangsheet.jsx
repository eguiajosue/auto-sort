/*
 * AutoSort Gangsheet DTF — script para Adobe Illustrator
 *
 * Acomoda varios elementos en un lienzo para aprovechar al máximo el espacio
 * (gangsheet para impresión DTF), dejando una separación configurable entre
 * ellos para poder recortarlos.
 *
 *  - Nunca cambia el tamaño de los elementos: solo los mueve y, si se permite,
 *    los gira en múltiplos de 90°.
 *  - Los grupos (y grupos con máscara de recorte) se tratan como una sola pieza.
 *  - Dos modos de lienzo:
 *      1) Ancho fijo / alto automático (rollo): minimiza el largo de la hoja.
 *      2) Mesa de trabajo actual: acomoda dentro del artboard activo.
 *  - Cantidades por diseño con etiquetas de talla (S, M, L, XL...).
 *  - Revisión previa (preflight), largos estándar, costo estimado y
 *    exportación a PNG transparente.
 *
 * Instalación: copiar este archivo a la carpeta
 *   <Illustrator>/Presets/<idioma>/Scripts/
 * y reiniciar Illustrator. Aparece en Archivo > Secuencias de comandos.
 * También se puede ejecutar con Archivo > Secuencias de comandos > Otra secuencia...
 */

//@target illustrator

(function () {

    // =====================================================================
    // === PACKER START ===
    // Motor de acomodo (MaxRects) independiente de Illustrator. Trabaja con
    // rectángulos en coordenadas "pantalla": origen arriba-izquierda, Y hacia
    // abajo. Escrito en ES3 para ExtendScript.
    // =====================================================================
    var Packer = (function () {
        var EPS = 1e-4;
        var HUGE = 1e30;

        function contains(a, b) {
            return b.x >= a.x - EPS && b.y >= a.y - EPS &&
                b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
        }

        function better(s1, s2, b1, b2) {
            if (s1 < b1 - EPS) return true;
            if (s1 > b1 + EPS) return false;
            return s2 < b2 - EPS;
        }

        function overlapLen(a1, a2, b1, b2) {
            if (a2 < b1 + EPS || b2 < a1 + EPS) return 0;
            return Math.min(a2, b2) - Math.max(a1, b1);
        }

        // ---------------------------------------------------------------
        // Contenedor MaxRects
        // ---------------------------------------------------------------
        function Bin(w, h, allowRotate, minDim) {
            this.w = w;
            this.h = h;
            this.allowRotate = allowRotate;
            this.minDim = minDim || 0;
            this.free = [{ x: 0, y: 0, w: w, h: h }];
            this.used = [];
        }

        Bin.prototype.contactScore = function (x, y, w, h) {
            var s = 0, i, u;
            if (x < EPS || Math.abs(x + w - this.w) < EPS) s += h;
            if (y < EPS || Math.abs(y + h - this.h) < EPS) s += w;
            for (i = 0; i < this.used.length; i++) {
                u = this.used[i];
                if (Math.abs(u.x - (x + w)) < EPS || Math.abs(u.x + u.w - x) < EPS) {
                    s += overlapLen(u.y, u.y + u.h, y, y + h);
                }
                if (Math.abs(u.y - (y + h)) < EPS || Math.abs(u.y + u.h - y) < EPS) {
                    s += overlapLen(u.x, u.x + u.w, x, x + w);
                }
            }
            return s;
        };

        // Busca la mejor posición para un rectángulo w x h según la heurística.
        // Devuelve {x, y, w, h, rotated, s1, s2} o null.
        Bin.prototype.find = function (w, h, heur) {
            var best = null, b1 = HUGE, b2 = HUGE;
            var i, f, k, rw, rh, rot, s1, s2, lw, lh;
            for (i = 0; i < this.free.length; i++) {
                f = this.free[i];
                for (k = 0; k < 2; k++) {
                    if (k === 0) { rw = w; rh = h; rot = false; }
                    else {
                        if (!this.allowRotate || Math.abs(w - h) < EPS) break;
                        rw = h; rh = w; rot = true;
                    }
                    if (rw > f.w + EPS || rh > f.h + EPS) continue;
                    lw = f.w - rw;
                    lh = f.h - rh;
                    switch (heur) {
                        case "BSSF": s1 = Math.min(lw, lh); s2 = Math.max(lw, lh); break;
                        case "BLSF": s1 = Math.max(lw, lh); s2 = Math.min(lw, lh); break;
                        case "BAF": s1 = f.w * f.h - rw * rh; s2 = Math.min(lw, lh); break;
                        case "CP": s1 = -this.contactScore(f.x, f.y, rw, rh); s2 = f.y + rh; break;
                        default: /* BL */ s1 = f.y + rh; s2 = f.x; break;
                    }
                    if (better(s1, s2, b1, b2)) {
                        b1 = s1; b2 = s2;
                        best = { x: f.x, y: f.y, w: rw, h: rh, rotated: rot, s1: s1, s2: s2 };
                    }
                }
            }
            return best;
        };

        Bin.prototype.place = function (node) {
            var keep = [], pieces = [], i, j, f, p, drop, nx2, ny2, fx2, fy2;
            nx2 = node.x + node.w;
            ny2 = node.y + node.h;
            for (i = 0; i < this.free.length; i++) {
                f = this.free[i];
                fx2 = f.x + f.w;
                fy2 = f.y + f.h;
                if (node.x >= fx2 - EPS || nx2 <= f.x + EPS || node.y >= fy2 - EPS || ny2 <= f.y + EPS) {
                    keep.push(f);
                    continue;
                }
                if (node.x > f.x + EPS) pieces.push({ x: f.x, y: f.y, w: node.x - f.x, h: f.h });
                if (nx2 < fx2 - EPS) pieces.push({ x: nx2, y: f.y, w: fx2 - nx2, h: f.h });
                if (node.y > f.y + EPS) pieces.push({ x: f.x, y: f.y, w: f.w, h: node.y - f.y });
                if (ny2 < fy2 - EPS) pieces.push({ x: f.x, y: ny2, w: f.w, h: fy2 - ny2 });
            }
            // Descarta piezas donde ya no cabe ningún elemento.
            var md = this.minDim - EPS, useful = [];
            for (i = 0; i < pieces.length; i++) {
                p = pieces[i];
                if (p.w >= md && p.h >= md) useful.push(p);
            }
            // Elimina piezas contenidas en otras (las antiguas nunca quedan
            // contenidas en las nuevas porque ya estaban podadas).
            for (i = 0; i < useful.length; i++) {
                p = useful[i];
                drop = false;
                for (j = 0; j < useful.length && !drop; j++) {
                    if (i === j) continue;
                    if (contains(useful[j], p) && (!contains(p, useful[j]) || j < i)) drop = true;
                }
                for (j = 0; j < keep.length && !drop; j++) {
                    if (contains(keep[j], p)) drop = true;
                }
                if (!drop) keep.push(p);
            }
            this.free = keep;
            this.used.push(node);
        };

        // ---------------------------------------------------------------
        // Ordenamientos
        // ---------------------------------------------------------------
        var SORTS = {
            area: function (a, b) { return (b.w * b.h - a.w * a.h) || (Math.max(b.w, b.h) - Math.max(a.w, a.h)); },
            maxSide: function (a, b) {
                return (Math.max(b.w, b.h) - Math.max(a.w, a.h)) || (Math.min(b.w, b.h) - Math.min(a.w, a.h));
            },
            height: function (a, b) { return (b.h - a.h) || (b.w - a.w); },
            width: function (a, b) { return (b.w - a.w) || (b.h - a.h); },
            perimeter: function (a, b) { return (b.w + b.h) - (a.w + a.h); },
            minSide: function (a, b) {
                return (Math.min(b.w, b.h) - Math.min(a.w, a.h)) || (Math.max(b.w, b.h) - Math.max(a.w, a.h));
            }
        };

        function sorted(rects, sortName) {
            var copy = rects.slice(0), fn = SORTS[sortName];
            copy.sort(function (a, b) { return fn(a, b) || (a.id - b.id); });
            return copy;
        }

        // withoutRotation: añade también las variantes sin girar (un acomodo
        // codicioso con giro no siempre gana al mismo sin giro).
        function buildCombos(quality, allowRotate, withoutRotation) {
            var heurs, sorts, globalMode, combos = [], i, j, r, rots;
            if (quality === "fast") {
                heurs = ["BL", "BSSF"];
                sorts = ["area", "maxSide"];
                globalMode = false;
            } else {
                heurs = ["BL", "BSSF", "CP", "BAF", "BLSF"];
                sorts = ["area", "maxSide", "height", "width", "perimeter", "minSide"];
                globalMode = quality === "best";
            }
            rots = allowRotate ? (withoutRotation ? [true, false] : [true]) : [false];
            for (r = 0; r < rots.length; r++) {
                for (i = 0; i < heurs.length; i++) {
                    for (j = 0; j < sorts.length; j++) combos.push({ heur: heurs[i], sort: sorts[j], global: false, rot: rots[r] });
                }
                if (globalMode) {
                    for (i = 0; i < heurs.length; i++) combos.push({ heur: heurs[i], sort: "area", global: true, rot: rots[r] });
                }
            }
            return combos;
        }

        // ---------------------------------------------------------------
        // Ejecución de una combinación
        // ---------------------------------------------------------------
        function run(rects, binW, binH, combo, minDim, failFast) {
            var bin = new Bin(binW, binH, combo.rot, minDim);
            var placed = [], unplaced = [], usedH = 0, i, r, node, order;
            if (!combo.global) {
                order = sorted(rects, combo.sort);
                for (i = 0; i < order.length; i++) {
                    r = order[i];
                    node = bin.find(r.w, r.h, combo.heur);
                    if (!node) {
                        if (failFast) return null;
                        unplaced.push(r.id);
                        continue;
                    }
                    node.id = r.id;
                    bin.place(node);
                    placed.push(node);
                    if (node.y + node.h > usedH) usedH = node.y + node.h;
                }
            } else {
                var remaining = sorted(rects, combo.sort), bestIdx, bestNode, cand;
                while (remaining.length) {
                    bestIdx = -1; bestNode = null;
                    for (i = 0; i < remaining.length; i++) {
                        cand = bin.find(remaining[i].w, remaining[i].h, combo.heur);
                        if (cand && (!bestNode || better(cand.s1, cand.s2, bestNode.s1, bestNode.s2))) {
                            bestNode = cand; bestIdx = i;
                        }
                    }
                    if (!bestNode) {
                        if (failFast) return null;
                        for (i = 0; i < remaining.length; i++) unplaced.push(remaining[i].id);
                        break;
                    }
                    bestNode.id = remaining[bestIdx].id;
                    bin.place(bestNode);
                    placed.push(bestNode);
                    if (bestNode.y + bestNode.h > usedH) usedH = bestNode.y + bestNode.h;
                    remaining.splice(bestIdx, 1);
                }
            }
            var area = 0;
            for (i = 0; i < placed.length; i++) area += placed[i].w * placed[i].h;
            return { placed: placed, unplaced: unplaced, usedH: usedH, area: area };
        }

        // ---------------------------------------------------------------
        // Preparación común
        // ---------------------------------------------------------------
        function prepare(items, binW, binH, gap, allowRotate) {
            var rects = [], tooBig = [], minDim = HUGE, i, it, w, h, fits;
            for (i = 0; i < items.length; i++) {
                it = items[i];
                w = it.w + gap;
                h = it.h + gap;
                fits = (w <= binW + EPS && h <= binH + EPS) ||
                    (allowRotate && h <= binW + EPS && w <= binH + EPS);
                if (!fits) { tooBig.push(it.id); continue; }
                rects.push({ id: it.id, w: w, h: h });
                if (Math.min(w, h) < minDim) minDim = Math.min(w, h);
            }
            return { rects: rects, tooBig: tooBig, minDim: minDim === HUGE ? 0 : minDim };
        }

        function toResult(res, margin, gap, sheetH, extraUnplaced) {
            var out = [], i, n;
            for (i = 0; i < res.placed.length; i++) {
                n = res.placed[i];
                out.push({ id: n.id, x: margin + n.x, y: margin + n.y, w: n.w - gap, h: n.h - gap, rotated: n.rotated });
            }
            return { placements: out, unplaced: res.unplaced.concat(extraUnplaced), height: sheetH };
        }

        function progress(opts, done, total, msg) {
            if (opts.onProgress) opts.onProgress(done, total, msg);
        }

        // ---------------------------------------------------------------
        // Modo rollo: ancho fijo, alto mínimo
        // opts: {width, gap, margin, allowRotate, quality, tolerance, onProgress}
        // ---------------------------------------------------------------
        function packStrip(items, opts) {
            var gap = opts.gap || 0, margin = opts.margin || 0;
            var binW = opts.width - 2 * margin + gap;
            var i, r, sumH = 0, area = 0, lo = 0;
            var prep = prepare(items, binW, HUGE, gap, opts.allowRotate);
            var rects = prep.rects;
            if (!rects.length) return { placements: [], unplaced: prep.tooBig, height: 2 * margin };

            for (i = 0; i < rects.length; i++) {
                r = rects[i];
                sumH += Math.max(r.w, r.h);
                area += r.w * r.h;
                // Alto mínimo que exige cada pieza en su mejor orientación posible.
                var need = r.h;
                if (opts.allowRotate && r.h > r.w && r.h <= binW + EPS) need = r.w;
                if (r.w > binW + EPS) need = r.w; // solo cabe girada
                if (need > lo) lo = need;
            }
            if (area / binW > lo) lo = area / binW;

            // Sin girar no se puede si alguna pieza solo cabe girada.
            var canSkipRot = true;
            for (i = 0; i < rects.length; i++) if (rects[i].w > binW + EPS) canSkipRot = false;
            var combos = buildCombos(opts.quality, opts.allowRotate, opts.quality === "best" && canSkipRot);
            var tol = opts.tolerance || 2.834645669; // 1 mm
            var maxIter = 14, total = combos.length * (1 + maxIter), done = 0;
            var best = null, res, c;

            // 1) Cota superior con un contenedor "infinito".
            for (c = 0; c < combos.length; c++) {
                res = run(rects, binW, sumH + 1, combos[c], prep.minDim, false);
                if (!res.unplaced.length && (!best || res.usedH < best.usedH - EPS)) best = res;
                progress(opts, ++done, total, "Buscando acomodo inicial");
            }

            if (!best) return toResult(res, margin, gap, res.usedH - gap + 2 * margin, prep.tooBig);

            // 2) Búsqueda binaria del alto mínimo factible.
            var hi = best.usedH, mid, found, iter = 0;
            while (hi - lo > tol && iter < maxIter) {
                iter++;
                mid = (lo + hi) / 2;
                found = null;
                for (c = 0; c < combos.length; c++) {
                    res = run(rects, binW, mid, combos[c], prep.minDim, true);
                    progress(opts, ++done, total, "Reduciendo largo de la hoja (" + iter + ")");
                    if (res) { found = res; break; }
                }
                done = (1 + iter) * combos.length;
                if (found) {
                    if (found.usedH < best.usedH) best = found;
                    hi = found.usedH;
                } else {
                    lo = mid;
                }
            }
            progress(opts, total, total, "Listo");
            return toResult(best, margin, gap, best.usedH - gap + 2 * margin, prep.tooBig);
        }

        // ---------------------------------------------------------------
        // Modo mesa de trabajo: ancho y alto fijos
        // opts: {width, height, gap, margin, allowRotate, quality, onProgress}
        // ---------------------------------------------------------------
        function packFixed(items, opts) {
            var gap = opts.gap || 0, margin = opts.margin || 0;
            var binW = opts.width - 2 * margin + gap;
            var binH = opts.height - 2 * margin + gap;
            var prep = prepare(items, binW, binH, gap, opts.allowRotate);
            if (!prep.rects.length) return { placements: [], unplaced: prep.tooBig, height: opts.height };

            var combos = buildCombos(opts.quality, opts.allowRotate, true), best = null, res, c;
            for (c = 0; c < combos.length; c++) {
                res = run(prep.rects, binW, binH, combos[c], prep.minDim, false);
                if (!best ||
                    res.placed.length > best.placed.length ||
                    (res.placed.length === best.placed.length && res.area > best.area + EPS) ||
                    (res.placed.length === best.placed.length && Math.abs(res.area - best.area) <= EPS && res.usedH < best.usedH - EPS)) {
                    best = res;
                }
                progress(opts, c + 1, combos.length, "Probando acomodos");
            }
            return toResult(best, margin, gap, opts.height, prep.tooBig);
        }

        return { packStrip: packStrip, packFixed: packFixed, Bin: Bin };
    })();
    // === PACKER END ===

    // =====================================================================
    // === UTILS START ===
    // Utilidades puras (sin Illustrator), probadas en Node.
    // =====================================================================
    var Utils = (function () {
        function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }

        function parseNum(s) {
            var v = parseFloat(String(s).replace(",", "."));
            return isNaN(v) ? null : v;
        }

        // "50, 100; 150 200" -> [50, 100, 150, 200] (ordenado, sin inválidos)
        function parseList(s) {
            // Separadores: ";" , ", " (coma + espacio) o espacios. "50,5" es decimal.
            var parts = String(s).split(/\s*;\s*|\s*,\s+|\s+/), out = [], i, v;
            for (i = 0; i < parts.length; i++) {
                if (!parts[i]) continue;
                v = parseNum(parts[i]);
                if (v !== null && v > 0) out.push(v);
            }
            out.sort(function (a, b) { return a - b; });
            return out;
        }

        function formatList(list, d) {
            var out = [], i;
            for (i = 0; i < list.length; i++) out.push(String(round(list[i], d)));
            return out.join("; ");
        }

        // Cantidad indicada al final del nombre: "Logo x10", "Logo ×10", "Logo X 3"
        function qtyFromName(name) {
            var m = /[x×]\s*(\d{1,4})\s*$/i.exec(String(name || ""));
            if (!m) return 1;
            var q = parseInt(m[1], 10);
            return q > 0 ? q : 1;
        }

        // Largo final de la hoja.
        // mode: 0 = exacto, 1 = redondeado a unidad entera, 2 = tamaño estándar.
        function pickLength(need, mode, standards, unitPt) {
            var i;
            if (mode === 2) {
                for (i = 0; i < standards.length; i++) {
                    if (standards[i] >= need - 1e-6) return { length: standards[i], standard: true };
                }
                return { length: Math.ceil(need / unitPt - 1e-6) * unitPt, standard: false, exceeded: standards.length > 0 };
            }
            if (mode === 1) return { length: Math.ceil(need / unitPt - 1e-6) * unitPt, standard: false };
            return { length: need, standard: false };
        }

        function cost(lengthPt, price, priceUnitPt) {
            return lengthPt / priceUnitPt * price;
        }

        function safeFileName(s) {
            return String(s).replace(/[\\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
        }

        // --- Etiquetas de talla ---
        var NOTE_TAG = "AutoSort talla:";

        function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }

        function labelFromNote(note) {
            var m = /AutoSort talla:[ \t]*([^\r\n]*)/.exec(String(note || ""));
            return m ? trim(m[1]) : "";
        }

        // Devuelve la nota con la etiqueta actualizada sin tocar el resto del texto.
        function noteWithLabel(note, label) {
            var lines = String(note || "").split(/\r\n|\r|\n/), out = [], i;
            for (i = 0; i < lines.length; i++) {
                if (lines[i].indexOf(NOTE_TAG) === 0 || !lines[i]) continue;
                out.push(lines[i]);
            }
            if (label) out.push(NOTE_TAG + " " + label);
            return out.join("\r");
        }

        // Tamaño del rectángulo "diseño + etiqueta debajo" (sin girar).
        function labeledSize(pw, ph, lw, lh, off) {
            if (!lw || !lh) return { w: pw, h: ph };
            return { w: Math.max(pw, lw), h: ph + off + lh };
        }

        // Reparte el rectángulo acomodado p (pantalla: Y hacia abajo) entre el
        // diseño y su etiqueta. dir: "cw" (giro horario) o "ccw".
        // Al girar en sentido horario lo que estaba abajo queda a la izquierda;
        // en antihorario, a la derecha.
        function labelSlots(p, pw, ph, lw, lh, off, dir) {
            if (!lw || !lh) return { design: { x: p.x, y: p.y, w: p.w, h: p.h }, label: null };
            if (!p.rotated) {
                return {
                    design: { x: p.x, y: p.y, w: p.w, h: ph },
                    label: { x: p.x, y: p.y + ph + off, w: p.w, h: lh }
                };
            }
            if (dir === "cw") {
                return {
                    design: { x: p.x + lh + off, y: p.y, w: ph, h: p.h },
                    label: { x: p.x, y: p.y, w: lh, h: p.h }
                };
            }
            return {
                design: { x: p.x, y: p.y, w: ph, h: p.h },
                label: { x: p.x + ph + off, y: p.y, w: lh, h: p.h }
            };
        }

        return {
            round: round, parseNum: parseNum, parseList: parseList, formatList: formatList,
            qtyFromName: qtyFromName, pickLength: pickLength, cost: cost, safeFileName: safeFileName,
            trim: trim, labelFromNote: labelFromNote, noteWithLabel: noteWithLabel,
            labeledSize: labeledSize, labelSlots: labelSlots
        };
    })();
    // === UTILS END ===

    // =====================================================================
    // Integración con Illustrator
    // =====================================================================
    var SCRIPT_NAME = "AutoSort Gangsheet DTF";
    var UNITS = { mm: 2.834645669, cm: 28.34645669, "in": 72 };
    var UNIT_NAMES = ["mm", "cm", "in"];
    var PRICE_UNITS = { cm: 28.34645669, m: 2834.645669, "in": 72, ft: 864 };
    var PRICE_UNIT_NAMES = ["cm", "m", "in", "ft"];
    var MAX_CANVAS = 16383; // pt, límite de una mesa de trabajo
    var MIN_TEXT_PT = 6;
    var PREFLIGHT_MAX_NODES = 20000;
    var LABEL_LAYER = "Etiquetas de talla";
    var SIZE_PRESETS = ["(sin etiqueta)", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "Personalizada..."];
    var CONFIG_FILE = File(Folder.userData + "/AutoSortGangsheetDTF.cfg");
    var TYPE_LABELS = {
        GroupItem: "Grupo", PathItem: "Trazado", CompoundPathItem: "Trazado compuesto",
        RasterItem: "Imagen incrustada", PlacedItem: "Imagen vinculada", TextFrame: "Texto",
        SymbolItem: "Símbolo", PluginItem: "Objeto", MeshItem: "Malla"
    };

    var round = Utils.round, parseNum = Utils.parseNum;

    if (app.documents.length === 0) {
        alert("Abre un documento antes de ejecutar " + SCRIPT_NAME + ".", SCRIPT_NAME);
        return;
    }
    var doc = app.activeDocument;

    // --------------------------- Configuración --------------------------
    function loadConfig() {
        var cfg = {
            unit: "cm", mode: "strip", width: null, gap: 0.3 * UNITS.cm, margin: 0.3 * UNITS.cm,
            rotation: 1, quality: 1, resize: true, source: "selection",
            lengthMode: 0, stdLengths: "50; 100; 150; 200; 250; 300; 400; 500",
            price: 0, priceUnit: "m", currency: "$",
            exportPng: false, ppi: 300,
            preflight: true, minPpi: 300, minLine: 0.5 * UNITS.mm,
            labelPt: 7, labelOffset: 1.5 * UNITS.mm
        };
        try {
            if (CONFIG_FILE.exists && CONFIG_FILE.open("r")) {
                var saved = eval(CONFIG_FILE.read());
                CONFIG_FILE.close();
                for (var k in saved) if (saved.hasOwnProperty(k)) cfg[k] = saved[k];
                if (saved.roundUp && saved.lengthMode === undefined) cfg.lengthMode = 1; // v1
            }
        } catch (e) { }
        if (!UNITS[cfg.unit]) cfg.unit = "cm";
        if (!PRICE_UNITS[cfg.priceUnit]) cfg.priceUnit = "m";
        return cfg;
    }

    function saveConfig(cfg) {
        try {
            if (CONFIG_FILE.open("w")) {
                CONFIG_FILE.write(cfg.toSource());
                CONFIG_FILE.close();
            }
        } catch (e) { }
    }

    // --------------------------- Recolección ----------------------------
    function isTopLevel(item) {
        return item.parent && item.parent.typename === "Layer";
    }

    function layerUsable(layer) {
        while (layer && layer.typename === "Layer") {
            if (layer.locked || !layer.visible || layer.name === LABEL_LAYER) return false;
            layer = layer.parent;
        }
        return true;
    }

    function itemUsable(item) {
        if (item.locked || item.hidden) return false;
        if (item.typename === "PathItem" && item.guides) return false;
        return layerUsable(item.parent);
    }

    function itemKey(item) {
        try { if (item.uuid) return "u" + item.uuid; } catch (e) { }
        var path = "", p = item.parent;
        while (p && p.typename === "Layer") { path = p.name + "/" + path; p = p.parent; }
        return path + "#" + item.zOrderPosition;
    }

    function collectSelection() {
        var sel = doc.selection, out = [], seen = {}, i, it, key;
        // Si se está editando texto, la selección es un TextRange (no un arreglo).
        if (!sel || sel.typename || !sel.length) return out;
        for (i = 0; i < sel.length; i++) {
            it = sel[i];
            // Si se seleccionó algo dentro de un grupo, se usa el grupo completo.
            while (it.parent && it.parent.typename !== "Layer") it = it.parent;
            key = itemKey(it);
            if (seen[key]) continue;
            seen[key] = true;
            if (itemUsable(it)) out.push(it);
        }
        return out;
    }

    function collectAll() {
        var out = [];
        function walk(layer) {
            if (layer.locked || !layer.visible || layer.name === LABEL_LAYER) return;
            var i, it;
            for (i = 0; i < layer.pageItems.length; i++) {
                it = layer.pageItems[i];
                if (isTopLevel(it) && itemUsable(it)) out.push(it);
            }
            for (i = 0; i < layer.layers.length; i++) walk(layer.layers[i]);
        }
        for (var i = 0; i < doc.layers.length; i++) walk(doc.layers[i]);
        return out;
    }

    // ----------------------------- Medidas ------------------------------
    // Los grupos con máscara de recorte reportan límites que incluyen el arte
    // oculto, así que se mide la forma de recorte.
    function hasClipped(group) {
        if (group.clipped) return true;
        for (var i = 0; i < group.groupItems.length; i++) {
            if (hasClipped(group.groupItems[i])) return true;
        }
        return false;
    }

    function clipBounds(group) {
        var i, c;
        for (i = 0; i < group.pageItems.length; i++) {
            c = group.pageItems[i];
            if (c.typename === "PathItem" && c.clipping) return c.geometricBounds;
            if (c.typename === "CompoundPathItem" && c.pathItems.length && c.pathItems[0].clipping) return c.geometricBounds;
        }
        return null;
    }

    function union(a, b) {
        if (!a) return b;
        if (!b) return a;
        return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
    }

    function getBounds(item) {
        if (item.typename !== "GroupItem" || !hasClipped(item)) return item.visibleBounds;
        if (item.clipped) {
            var cb = clipBounds(item);
            if (cb) return cb;
        }
        var b = null, i, c;
        for (i = 0; i < item.pageItems.length; i++) {
            c = item.pageItems[i];
            if (c.hidden) continue;
            b = union(b, c.typename === "GroupItem" ? getBounds(c) : c.visibleBounds);
        }
        return b || item.visibleBounds;
    }

    function pieceName(item) {
        var n = "";
        try { n = item.name; } catch (e) { }
        if (!n && item.typename === "PlacedItem") {
            try { n = decodeURI(item.file.name); } catch (e2) { }
        }
        if (!n && item.typename === "TextFrame") {
            try { n = "Texto: " + item.contents.replace(/[\r\n]+/g, " ").substr(0, 24); } catch (e3) { }
        }
        return n || TYPE_LABELS[item.typename] || item.typename;
    }

    function makePieces(items) {
        var out = [], i, b, w, h, name;
        for (i = 0; i < items.length; i++) {
            b = getBounds(items[i]);
            w = b[2] - b[0];
            h = b[1] - b[3];
            if (w <= 0.01 || h <= 0.01) continue;
            name = pieceName(items[i]);
            var note = "";
            try { note = items[i].note; } catch (e) { }
            out.push({
                item: items[i], name: name, w: w, h: h,
                qty: Utils.qtyFromName(name), label: Utils.labelFromNote(note)
            });
        }
        return out;
    }

    // ----------------------------- Preflight ----------------------------
    function effectivePpi(item) {
        var m = item.matrix;
        var sx = Math.sqrt(m.mValueA * m.mValueA + m.mValueB * m.mValueB);
        return sx > 0 ? 72 / sx : null;
    }

    function inspectPiece(piece, opts) {
        var st = { minPpi: null, minLine: null, minText: null, text: false, missing: [], nodes: 0, partial: false };

        function visit(it) {
            if (st.nodes++ > PREFLIGHT_MAX_NODES) { st.partial = true; return; }
            try { if (it.hidden) return; } catch (e0) { }
            var i, ppi, size;
            switch (it.typename) {
                case "GroupItem":
                    for (i = 0; i < it.pageItems.length && !st.partial; i++) visit(it.pageItems[i]);
                    break;
                case "CompoundPathItem":
                    if (it.pathItems.length) visit(it.pathItems[0]);
                    break;
                case "PathItem":
                    if (it.stroked && !it.clipping && !it.guides && it.strokeWidth > 0 &&
                        (st.minLine === null || it.strokeWidth < st.minLine)) st.minLine = it.strokeWidth;
                    break;
                case "PlacedItem":
                    try {
                        if (!it.file.exists) st.missing.push(decodeURI(it.file.name));
                    } catch (e1) { st.missing.push("(vínculo roto)"); }
                    if (/\.(png|jpe?g|tiff?|psd|gif|bmp|webp)$/i.test(pieceName(it))) {
                        ppi = effectivePpi(it);
                        if (ppi && (st.minPpi === null || ppi < st.minPpi)) st.minPpi = ppi;
                    }
                    break;
                case "RasterItem":
                    ppi = effectivePpi(it);
                    if (ppi && (st.minPpi === null || ppi < st.minPpi)) st.minPpi = ppi;
                    break;
                case "TextFrame":
                    st.text = true;
                    try {
                        size = it.textRange.characterAttributes.size;
                        if (size && (st.minText === null || size < st.minText)) st.minText = size;
                    } catch (e2) { }
                    break;
            }
        }

        visit(piece.item);

        var out = [], mm = UNITS.mm;
        if (st.missing.length) out.push("vínculo roto o faltante: " + st.missing.join(", "));
        if (st.minPpi !== null && st.minPpi < opts.minPpi - 0.5) {
            out.push("imagen a " + Math.round(st.minPpi) + " ppi (mínimo " + opts.minPpi + ")");
        }
        if (st.minLine !== null && st.minLine < opts.minLine - 1e-4) {
            out.push("línea de " + round(st.minLine / mm, 2) + " mm (mínimo " + round(opts.minLine / mm, 2) + " mm)");
        }
        if (st.minText !== null && st.minText < MIN_TEXT_PT) out.push("texto de " + round(st.minText, 1) + " pt");
        if (st.text) out.push("texto sin convertir a contornos");
        if (st.partial) out.push("pieza muy compleja: revisión parcial");
        return out;
    }

    function runPreflight(pieces, opts) {
        var lines = [], i, issues, count = 0;
        for (i = 0; i < pieces.length; i++) {
            issues = inspectPiece(pieces[i], opts);
            if (issues.length) {
                count++;
                lines.push("• " + pieces[i].name + ": " + issues.join("; "));
            }
        }
        return { count: count, lines: lines };
    }

    function showPreflight(report) {
        var cs = doc.documentColorSpace === DocumentColorSpace.CMYK ? "CMYK" : "RGB";
        var w = new Window("dialog", SCRIPT_NAME + " — Revisión");
        w.alignChildren = "fill";
        w.add("statictext", undefined, report.count + " pieza(s) con observaciones. Modo de color del documento: " + cs + ".");
        var et = w.add("edittext", undefined, report.lines.join("\n"), { multiline: true, readonly: true, scrolling: true });
        et.preferredSize = [520, 260];
        var g = w.add("group");
        g.alignment = "right";
        g.add("button", undefined, "Cancelar", { name: "cancel" });
        g.add("button", undefined, "Continuar de todos modos", { name: "ok" });
        return w.show() === 1;
    }

    // ------------------------------ Diálogo -----------------------------
    function showDialog(cfg, info) {
        var unit = cfg.unit;
        var w = new Window("dialog", SCRIPT_NAME);
        w.orientation = "column";
        w.alignChildren = "fill";

        // Unidades (comunes a todas las pestañas)
        var gUnit = w.add("group");
        gUnit.add("statictext", undefined, "Unidades:");
        var ddUnit = gUnit.add("dropdownlist", undefined, UNIT_NAMES);
        for (var u = 0; u < UNIT_NAMES.length; u++) if (UNIT_NAMES[u] === unit) ddUnit.selection = u;

        var tabs = w.add("tabbedpanel");
        tabs.alignChildren = "fill";
        var tArr = tabs.add("tab", undefined, "Acomodo");
        var tQty = tabs.add("tab", undefined, "Cantidades");
        var tOut = tabs.add("tab", undefined, "Salida");
        tArr.alignChildren = tQty.alignChildren = tOut.alignChildren = "fill";

        var unitLabels = [];
        function numRow(parent, label, value, labelWidth) {
            var g = parent.add("group");
            var st = g.add("statictext", undefined, label);
            st.preferredSize.width = labelWidth || 150;
            var et = g.add("edittext", undefined, String(value));
            et.characters = 8;
            var lu = g.add("statictext", undefined, unit);
            lu.characters = 4;
            unitLabels.push(lu);
            return { edit: et, group: g };
        }

        // ---- Pestaña Acomodo ----
        var pItems = tArr.add("panel", undefined, "Elementos a acomodar");
        pItems.alignChildren = "left";
        var rbSel = pItems.add("radiobutton", undefined, "Selección actual (" + info.sel.length + " piezas)");
        var rbAll = pItems.add("radiobutton", undefined, "Todo lo visible y desbloqueado (" + info.all.length + " piezas)");
        pItems.add("statictext", undefined, "Cada grupo cuenta como una sola pieza.");
        rbSel.enabled = info.sel.length > 0;

        var pSheet = tArr.add("panel", undefined, "Lienzo");
        pSheet.alignChildren = "left";
        var rbStrip = pSheet.add("radiobutton", undefined, "Ancho fijo, largo automático (rollo DTF)");
        var rowW = numRow(pSheet, "    Ancho de la hoja:", round(cfg.width / UNITS[unit], 3));
        var rbFixed = pSheet.add("radiobutton", undefined, "");

        var pGap = tArr.add("panel", undefined, "Separación para recorte");
        pGap.alignChildren = "left";
        var rowGap = numRow(pGap, "Entre elementos:", round(cfg.gap / UNITS[unit], 3));
        var rowMargin = numRow(pGap, "Margen al borde:", round(cfg.margin / UNITS[unit], 3));

        var pOpt = tArr.add("panel", undefined, "Opciones");
        pOpt.alignChildren = "left";
        var gRot = pOpt.add("group");
        gRot.add("statictext", undefined, "Rotación:").preferredSize.width = 70;
        var ddRot = gRot.add("dropdownlist", undefined, [
            "No rotar",
            "0° / 90° / 180° / 270° (girar en sentido horario)",
            "0° / 90° / 180° / 270° (girar en sentido antihorario)"
        ]);
        ddRot.selection = cfg.rotation;
        var gQ = pOpt.add("group");
        gQ.add("statictext", undefined, "Calidad:").preferredSize.width = 70;
        var ddQ = gQ.add("dropdownlist", undefined, ["Rápida", "Normal", "Máxima (más lenta)"]);
        ddQ.selection = cfg.quality;

        // ---- Pestaña Cantidades ----
        // Cada fila es "diseño + talla + copias". Un diseño puede tener varias
        // filas (una por talla).
        function makeRows(pieces) {
            var rows = [], i;
            for (i = 0; i < pieces.length; i++) rows.push({ piece: pieces[i], label: pieces[i].label, qty: pieces[i].qty });
            return rows;
        }
        var rowsSel = makeRows(info.sel), rowsAll = makeRows(info.all);

        var lb = tQty.add("listbox", undefined, [], {
            multiselect: true, numberOfColumns: 4, showHeaders: true,
            columnTitles: ["Pieza", "Tamaño", "Talla", "Copias"], columnWidths: [220, 130, 70, 55]
        });
        lb.preferredSize = [500, 240];

        var gQ1 = tQty.add("group");
        gQ1.add("statictext", undefined, "Copias:");
        var etQty = gQ1.add("edittext", undefined, "1");
        etQty.characters = 5;
        var btnQty = gQ1.add("button", undefined, "Asignar copias");
        var btnReset = gQ1.add("button", undefined, "Reiniciar lista");

        var gQ2 = tQty.add("group");
        gQ2.add("statictext", undefined, "Talla:");
        var ddSize = gQ2.add("dropdownlist", undefined, SIZE_PRESETS);
        ddSize.selection = 0;
        var etCustom = gQ2.add("edittext", undefined, "");
        etCustom.characters = 8;
        etCustom.enabled = false;
        var btnLabel = gQ2.add("button", undefined, "Asignar talla");
        var btnAdd = gQ2.add("button", undefined, "Agregar talla");
        var btnDel = gQ2.add("button", undefined, "Quitar fila");
        ddSize.onChange = function () { etCustom.enabled = ddSize.selection.index === SIZE_PRESETS.length - 1; };

        var stTotal = tQty.add("statictext", undefined, "");
        stTotal.characters = 60;

        var pLabel = tQty.add("panel", undefined, "Etiqueta de talla (texto pequeño debajo de cada copia)");
        pLabel.alignChildren = "left";
        var gLab = pLabel.add("group");
        gLab.add("statictext", undefined, "Tamaño de letra:");
        var etLabelPt = gLab.add("edittext", undefined, String(cfg.labelPt));
        etLabelPt.characters = 4;
        gLab.add("statictext", undefined, "pt    Separación del diseño:");
        var etLabelOff = gLab.add("edittext", undefined, String(round(cfg.labelOffset / UNITS[unit], 3)));
        etLabelOff.characters = 6;
        var luLab = gLab.add("statictext", undefined, unit);
        luLab.characters = 4;
        unitLabels.push(luLab);
        pLabel.add("statictext", undefined, "Las etiquetas van en la capa \"" + LABEL_LAYER + "\" (ocúltala si no quieres imprimirlas).");
        tQty.add("statictext", undefined, "Tip: un nombre terminado en \"x10\" (p. ej. \"Logo x10\") toma 10 copias automáticamente.");

        function currentRows() { return rbSel.value ? rowsSel : rowsAll; }
        function setCurrentRows(r) { if (rbSel.value) rowsSel = r; else rowsAll = r; }
        function currentPieces() { return rbSel.value ? info.sel : info.all; }

        function sizeText(p) {
            var k = UNITS[unit];
            return round(p.w / k, 2) + " x " + round(p.h / k, 2) + " " + unit;
        }

        function updateTotal() {
            var rows = currentRows(), t = 0, i;
            for (i = 0; i < rows.length; i++) t += rows[i].qty;
            stTotal.text = "Total a acomodar: " + t + " pieza(s) de " + currentPieces().length + " diseño(s)";
        }

        function fillList(keepSel) {
            var rows = currentRows(), i, li;
            lb.removeAll();
            for (i = 0; i < rows.length; i++) {
                li = lb.add("item", rows[i].piece.name);
                li.subItems[0].text = sizeText(rows[i].piece);
                li.subItems[1].text = rows[i].label || "—";
                li.subItems[2].text = String(rows[i].qty);
            }
            if (keepSel) {
                for (i = 0; i < keepSel.length; i++) if (keepSel[i] < lb.items.length) lb.items[keepSel[i]].selected = true;
            }
            updateTotal();
        }

        function selectedIndexes() {
            var sel = lb.selection, out = [], i;
            if (!sel) return out;
            if (!(sel instanceof Array)) sel = [sel];
            for (i = 0; i < sel.length; i++) out.push(sel[i].index);
            out.sort(function (a, b) { return a - b; });
            return out;
        }

        function chosenLabel() {
            var idx = ddSize.selection.index;
            if (idx === 0) return "";
            if (idx === SIZE_PRESETS.length - 1) return Utils.trim(etCustom.text);
            return SIZE_PRESETS[idx];
        }

        function needSelection() {
            var idx = selectedIndexes();
            if (!idx.length) alert("Selecciona una o más filas de la lista.");
            return idx;
        }

        btnQty.onClick = function () {
            var q = parseInt(etQty.text, 10), idx = needSelection(), rows = currentRows(), i;
            if (!idx.length) return;
            if (isNaN(q) || q < 0) { alert("Escribe un número de copias válido (0 = no acomodar)."); return; }
            for (i = 0; i < idx.length; i++) rows[idx[i]].qty = q;
            fillList(idx);
        };

        btnLabel.onClick = function () {
            var idx = needSelection(), rows = currentRows(), label = chosenLabel(), i;
            if (!idx.length) return;
            if (ddSize.selection.index === SIZE_PRESETS.length - 1 && !label) { alert("Escribe la etiqueta personalizada."); return; }
            for (i = 0; i < idx.length; i++) rows[idx[i]].label = label;
            fillList(idx);
        };

        // Agrega una fila nueva (misma pieza, otra talla) debajo de las filas del diseño.
        btnAdd.onClick = function () {
            var idx = needSelection(), rows = currentRows(), label = chosenLabel();
            var q = parseInt(etQty.text, 10), i, j, piece, last, exists, done = [], newSel = [];
            if (!idx.length) return;
            if (!label) { alert("Elige una talla (o escribe una personalizada) para la fila nueva."); return; }
            if (isNaN(q) || q < 1) q = 1;
            for (i = 0; i < idx.length; i++) {
                piece = rows[idx[i]].piece;
                exists = false;
                for (j = 0; j < done.length; j++) if (done[j] === piece) exists = true;
                if (exists) continue;
                done.push(piece);
                last = -1;
                exists = null;
                for (j = 0; j < rows.length; j++) {
                    if (rows[j].piece !== piece) continue;
                    last = j;
                    if (rows[j].label === label) exists = rows[j];
                }
                if (exists) { exists.qty = q; continue; }
                rows.splice(last + 1, 0, { piece: piece, label: label, qty: q });
            }
            for (i = 0; i < rows.length; i++) {
                for (j = 0; j < done.length; j++) if (rows[i].piece === done[j] && rows[i].label === label) newSel.push(i);
            }
            fillList(newSel);
        };

        btnDel.onClick = function () {
            var idx = needSelection(), rows = currentRows(), out = [], i, j, removed, piece, others;
            if (!idx.length) return;
            for (i = 0; i < rows.length; i++) {
                removed = false;
                for (j = 0; j < idx.length; j++) if (idx[j] === i) removed = true;
                if (!removed) { out.push(rows[i]); continue; }
                // Si es la única fila del diseño, se deja con 0 copias.
                piece = rows[i].piece;
                others = false;
                for (j = 0; j < rows.length; j++) {
                    if (j !== i && rows[j].piece === piece) {
                        var alsoRemoved = false, k;
                        for (k = 0; k < idx.length; k++) if (idx[k] === j) alsoRemoved = true;
                        if (!alsoRemoved) others = true;
                    }
                }
                if (!others) {
                    var seen = false;
                    for (j = 0; j < out.length; j++) if (out[j].piece === piece) seen = true;
                    if (!seen) out.push({ piece: piece, label: "", qty: 0 });
                }
            }
            setCurrentRows(out);
            fillList();
        };

        btnReset.onClick = function () {
            if (rbSel.value) rowsSel = makeRows(info.sel); else rowsAll = makeRows(info.all);
            fillList();
        };
        rbSel.onClick = function () { rbAll.value = false; fillList(); };
        rbAll.onClick = function () { rbSel.value = false; fillList(); };

        // ---- Pestaña Salida ----
        var pLen = tOut.add("panel", undefined, "Largo de la hoja (modo rollo)");
        pLen.alignChildren = "left";
        var cbResize = pLen.add("checkbox", undefined, "Ajustar la mesa de trabajo al resultado");
        cbResize.value = cfg.resize;
        var gLen = pLen.add("group");
        gLen.add("statictext", undefined, "Largo:").preferredSize.width = 60;
        var ddLen = gLen.add("dropdownlist", undefined, [
            "Exacto", "Redondeado hacia arriba a unidad entera", "Tamaño estándar (el menor donde quepa)"
        ]);
        ddLen.selection = cfg.lengthMode;
        var gStd = pLen.add("group");
        gStd.add("statictext", undefined, "Largos estándar:").preferredSize.width = 100;
        var etStd = gStd.add("edittext", undefined, cfg.stdLengths);
        etStd.characters = 30;
        var luStd = gStd.add("statictext", undefined, unit);
        luStd.characters = 4;
        unitLabels.push(luStd);

        var pCost = tOut.add("panel", undefined, "Costo estimado");
        pCost.alignChildren = "left";
        var gCost = pCost.add("group");
        gCost.add("statictext", undefined, "Precio:");
        var etCur = gCost.add("edittext", undefined, cfg.currency);
        etCur.characters = 3;
        var etPrice = gCost.add("edittext", undefined, String(cfg.price));
        etPrice.characters = 8;
        gCost.add("statictext", undefined, "por");
        var ddPriceUnit = gCost.add("dropdownlist", undefined, PRICE_UNIT_NAMES);
        for (u = 0; u < PRICE_UNIT_NAMES.length; u++) if (PRICE_UNIT_NAMES[u] === cfg.priceUnit) ddPriceUnit.selection = u;
        gCost.add("statictext", undefined, "de largo (0 = no calcular)");

        var pExp = tOut.add("panel", undefined, "Exportar");
        pExp.alignChildren = "left";
        var gExp = pExp.add("group");
        var cbExport = gExp.add("checkbox", undefined, "Exportar PNG transparente a");
        cbExport.value = cfg.exportPng;
        var etPpi = gExp.add("edittext", undefined, String(cfg.ppi));
        etPpi.characters = 5;
        gExp.add("statictext", undefined, "ppi (en la carpeta del documento)");

        var pPre = tOut.add("panel", undefined, "Revisión antes de acomodar (preflight)");
        pPre.alignChildren = "left";
        var cbPre = pPre.add("checkbox", undefined, "Revisar resolución, vínculos, líneas finas y textos");
        cbPre.value = cfg.preflight;
        var gPre = pPre.add("group");
        gPre.add("statictext", undefined, "Resolución mínima:");
        var etMinPpi = gPre.add("edittext", undefined, String(cfg.minPpi));
        etMinPpi.characters = 5;
        gPre.add("statictext", undefined, "ppi    Línea mínima:");
        var etMinLine = gPre.add("edittext", undefined, String(round(cfg.minLine / UNITS[unit], 3)));
        etMinLine.characters = 6;
        var luLine = gPre.add("statictext", undefined, unit);
        luLine.characters = 4;
        unitLabels.push(luLine);

        // ---- Sincronización ----
        function fixedLabel() {
            return "Mesa de trabajo actual (" + round(info.abW / UNITS[unit], 2) + " x " +
                round(info.abH / UNITS[unit], 2) + " " + unit + ")";
        }
        rbFixed.text = fixedLabel();

        function syncMode() {
            var strip = rbStrip.value;
            rowW.group.enabled = strip;
            pLen.enabled = strip;
            gLen.enabled = gStd.enabled = cbResize.value;
            gStd.enabled = cbResize.value && ddLen.selection.index === 2;
            etPpi.enabled = cbExport.value;
            gPre.enabled = cbPre.value;
        }
        rbStrip.onClick = function () { rbFixed.value = false; syncMode(); };
        rbFixed.onClick = function () { rbStrip.value = false; syncMode(); };
        cbResize.onClick = cbExport.onClick = cbPre.onClick = syncMode;
        ddLen.onChange = syncMode;
        if (cfg.mode === "fixed") rbFixed.value = true; else rbStrip.value = true;

        var convRows = [rowW.edit, rowGap.edit, rowMargin.edit, etMinLine, etLabelOff];
        ddUnit.onChange = function () {
            var nu = UNIT_NAMES[ddUnit.selection.index], f = UNITS[unit] / UNITS[nu], i, v, list;
            for (i = 0; i < convRows.length; i++) {
                v = parseNum(convRows[i].text);
                if (v !== null) convRows[i].text = String(round(v * f, 3));
            }
            list = Utils.parseList(etStd.text);
            for (i = 0; i < list.length; i++) list[i] *= f;
            etStd.text = Utils.formatList(list, 2);
            for (i = 0; i < unitLabels.length; i++) unitLabels[i].text = nu;
            unit = nu;
            rbFixed.text = fixedLabel();
            fillList();
        };

        // Botones
        var gBtn = w.add("group");
        gBtn.alignment = "right";
        gBtn.add("button", undefined, "Cancelar", { name: "cancel" });
        var btnOk = gBtn.add("button", undefined, "Acomodar", { name: "ok" });

        var result = null;
        btnOk.onClick = function () {
            var k = UNITS[unit];
            var width = parseNum(rowW.edit.text), gap = parseNum(rowGap.edit.text), margin = parseNum(rowMargin.edit.text);
            var price = parseNum(etPrice.text), ppi = parseNum(etPpi.text);
            var minPpi = parseNum(etMinPpi.text), minLine = parseNum(etMinLine.text);
            var std = Utils.parseList(etStd.text), i, total = 0, rows = currentRows();
            var labelPt = parseNum(etLabelPt.text), labelOff = parseNum(etLabelOff.text);
            if (!rbSel.value && !rbAll.value) { alert("Elige qué elementos acomodar."); return; }
            for (i = 0; i < rows.length; i++) total += rows[i].qty;
            if (!total) { alert("Todas las piezas tienen 0 copias."); return; }
            if (labelPt === null || labelPt < 2 || labelPt > 200) { alert("El tamaño de letra de la etiqueta no es válido."); return; }
            if (labelOff === null || labelOff < 0) { alert("La separación de la etiqueta no es válida."); return; }
            if (rbStrip.value && (width === null || width <= 0)) { alert("El ancho de la hoja no es válido."); return; }
            if (gap === null || gap < 0) { alert("La separación entre elementos no es válida."); return; }
            if (margin === null || margin < 0) { alert("El margen al borde no es válido."); return; }
            if (price === null || price < 0) { alert("El precio no es válido."); return; }
            if (cbExport.value && (ppi === null || ppi < 36 || ppi > 2400)) { alert("La resolución de exportación no es válida."); return; }
            if (cbPre.value && (minPpi === null || minPpi <= 0 || minLine === null || minLine < 0)) {
                alert("Los valores de revisión no son válidos."); return;
            }
            if (rbStrip.value && cbResize.value && ddLen.selection.index === 2 && !std.length) {
                alert("Escribe al menos un largo estándar (separados por ; o espacios)."); return;
            }
            for (i = 0; i < std.length; i++) std[i] *= k;
            result = {
                unit: unit,
                source: rbSel.value ? "selection" : "all",
                mode: rbStrip.value ? "strip" : "fixed",
                width: rbStrip.value ? width * k : cfg.width,
                gap: gap * k,
                margin: margin * k,
                rotation: ddRot.selection.index,
                quality: ddQ.selection.index,
                resize: cbResize.value,
                lengthMode: ddLen.selection.index,
                stdLengths: etStd.text,
                stdPt: std,
                price: price,
                priceUnit: PRICE_UNIT_NAMES[ddPriceUnit.selection.index],
                currency: etCur.text,
                exportPng: cbExport.value,
                ppi: ppi === null ? cfg.ppi : ppi,
                preflight: cbPre.value,
                minPpi: minPpi === null ? cfg.minPpi : minPpi,
                minLine: minLine === null ? cfg.minLine : minLine * k,
                labelPt: labelPt,
                labelOffset: labelOff * k,
                rows: rows
            };
            w.close(1);
        };

        if (cfg.source === "all" || !info.sel.length) rbAll.value = true; else rbSel.value = true;
        tabs.selection = tArr;
        fillList();
        syncMode();
        return w.show() === 1 ? result : null;
    }

    // ----------------------------- Progreso -----------------------------
    function ProgressWindow() {
        var w = new Window("palette", SCRIPT_NAME);
        w.alignChildren = "fill";
        var txt = w.add("statictext", undefined, "Calculando...");
        txt.characters = 45;
        var bar = w.add("progressbar", undefined, 0, 100);
        bar.preferredSize = [320, 14];
        w.show();
        var last = 0;
        this.update = function (done, total, msg) {
            var now = new Date().getTime();
            if (now - last < 100 && done < total) return;
            last = now;
            bar.value = total ? Math.min(100, (done / total) * 100) : 0;
            if (msg) txt.text = msg;
            w.update();
        };
        this.close = function () { w.close(); };
    }

    // ----------------------------- Exportar -----------------------------
    function findExported(folder, base) {
        var cands = folder.getFiles(base + "*.png"), subs = folder.getFiles(), i, best = null, f;
        for (i = 0; i < subs.length; i++) {
            if (subs[i] instanceof Folder) cands = cands.concat(subs[i].getFiles(base + "*.png"));
        }
        for (i = 0; i < cands.length; i++) {
            f = cands[i];
            if (!best || f.modified > best.modified) best = f;
        }
        return best;
    }

    function exportPng(abIndex, file, ppi) {
        var folder = file.parent, base = file.name.replace(/\.png$/i, "");
        var ab = doc.artboards[abIndex], oldName = ab.name, started = new Date(), found, err = "";
        if (file.exists) file.remove();

        // 1) Exportar para pantallas (CC 2018+): admite hojas grandes.
        try {
            ab.name = base;
            var o = new ExportForScreensOptionsPNG24();
            o.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
            o.transparentBackground = true;
            o.scaleType = ExportForScreensScaleType.SCALEBYRESOLUTION;
            o.scaleTypeValue = ppi;
            var what = new ExportForScreensItemToExport();
            what.artboards = String(abIndex + 1);
            what.document = false;
            doc.exportForScreens(folder, ExportForScreensType.SE_PNG24, o, what, "");
        } catch (e) {
            err = e.message;
        } finally {
            ab.name = oldName;
        }
        if (file.exists) return { file: file };
        found = findExported(folder, base);
        if (found && found.modified >= new Date(started.getTime() - 2000)) {
            if (found.fsName !== file.fsName) {
                found.copy(file);
                found.remove();
            }
            return { file: file };
        }

        // 2) Alternativa para versiones antiguas.
        try {
            var io = new ImageCaptureOptions();
            io.resolution = ppi;
            io.transparency = true;
            io.antiAliasing = true;
            doc.imageCapture(file, ab.artboardRect, io);
        } catch (e2) {
            err = e2.message;
        }
        return file.exists ? { file: file } : { error: err || "error desconocido" };
    }

    function exportTarget(sizeLabel) {
        var folder = null, name = "gangsheet";
        try {
            folder = doc.path && String(doc.path) !== "" ? Folder(doc.path) : null;
            name = doc.name.replace(/\.[^.]+$/, "");
        } catch (e) { }
        if (!folder || !folder.exists) {
            folder = Folder.selectDialog("¿Dónde guardar el PNG?");
            if (!folder) return null;
        }
        return File(folder.fsName + "/" + Utils.safeFileName(name + "_" + sizeLabel) + ".png");
    }

    // ------------------------------ Lienzo ------------------------------
    // Coloca la mesa de trabajo con el tamaño w x h lo más cerca posible de su
    // posición actual sin salirse del lienzo. Devuelve el nuevo borde superior
    // o null. Deja la mesa con su rectángulo original.
    function fitOnCanvas(abObj, orig, w, h) {
        var l = orig[0], t = orig[1], ok, bad, mid, n = 0, top = null;
        function trySet(r) {
            try { abObj.artboardRect = r; return true; } catch (e) { return false; }
        }
        if (trySet([l, t, l + w, t - h])) {
            top = t;
        } else if (trySet(orig)) {
            // Busca el borde inferior del lienzo conservando el borde superior.
            ok = orig[3];
            bad = t - h;
            while (ok - bad > 0.5 && n++ < 40) {
                mid = (ok + bad) / 2;
                if (trySet([orig[0], t, orig[2], mid])) ok = mid; else bad = mid;
            }
            ok = Math.ceil(ok);
            if (trySet([l, ok + h, l + w, ok])) top = ok + h;
        }
        trySet(orig);
        return top;
    }

    // ------------------------------ Principal ---------------------------
    var abIndex = doc.artboards.getActiveArtboardIndex();
    var artboard = doc.artboards[abIndex];
    var ab = artboard.artboardRect; // [izq, arriba, der, abajo]
    var abW = ab[2] - ab[0], abH = ab[1] - ab[3];

    var selPieces = makePieces(collectSelection());
    var allPieces = makePieces(collectAll());
    if (!selPieces.length && !allPieces.length) {
        alert("No hay elementos visibles y desbloqueados para acomodar.", SCRIPT_NAME);
        return;
    }

    var cfg = loadConfig();
    if (!cfg.width) cfg.width = abW;
    if (!selPieces.length) cfg.source = "all";

    var opts = showDialog(cfg, { sel: selPieces, all: allPieces, abW: abW, abH: abH });
    if (!opts) return;
    var stdPt = opts.stdPt, rows = opts.rows;
    delete opts.stdPt;
    delete opts.rows;
    saveConfig(opts);

    // Diseños a acomodar y total de copias por diseño (sumando sus tallas).
    var pieces = [], i, j;
    for (i = 0; i < rows.length; i++) {
        if (rows[i].qty <= 0) continue;
        if (rows[i].piece.total === undefined) {
            rows[i].piece.total = 0;
            rows[i].piece.idx = pieces.length;
            pieces.push(rows[i].piece);
        }
        rows[i].piece.total += rows[i].qty;
    }

    // Revisión previa
    var preflightNote = "";
    if (opts.preflight) {
        var report = runPreflight(pieces, opts);
        if (report.count) {
            if (!showPreflight(report)) return;
            preflightNote = "\nRevisión: " + report.count + " pieza(s) con observaciones.";
        } else {
            preflightNote = "\nRevisión: sin observaciones.";
        }
    }

    // ------------------------- Etiquetas de talla -----------------------
    var labelFont = null, labelColor, labelLayer = null, labelSize = {}, usesLabels = false;
    try { labelFont = app.textFonts.getByName("ArialMT"); } catch (e) { }
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        labelColor = new CMYKColor();
        labelColor.black = 100;
    } else {
        labelColor = new RGBColor();
        labelColor.red = labelColor.green = labelColor.blue = 0;
    }

    function getLabelLayer(create) {
        if (labelLayer) return labelLayer;
        try { labelLayer = doc.layers.getByName(LABEL_LAYER); } catch (e) { labelLayer = null; }
        if (!labelLayer && create) {
            labelLayer = doc.layers.add();
            labelLayer.name = LABEL_LAYER;
        }
        if (labelLayer) {
            labelLayer.locked = false;
            labelLayer.visible = true;
        }
        return labelLayer;
    }

    function dropEmptyLabelLayer() {
        try { if (labelLayer && !labelLayer.pageItems.length) labelLayer.remove(); } catch (e) { }
    }

    function makeLabel(text) {
        var tf = getLabelLayer(true).textFrames.add();
        tf.contents = text;
        var ca = tf.textRange.characterAttributes;
        ca.size = opts.labelPt;
        if (labelFont) ca.textFont = labelFont;
        ca.fillColor = labelColor;
        try { tf.name = "Talla " + text; } catch (e) { }
        return tf;
    }

    for (i = 0; i < rows.length; i++) {
        if (rows[i].qty > 0 && rows[i].label && !labelSize[rows[i].label]) {
            var probe = makeLabel(rows[i].label), pb = probe.geometricBounds;
            labelSize[rows[i].label] = { w: pb[2] - pb[0], h: pb[1] - pb[3] };
            probe.remove();
            usesLabels = true;
        }
    }

    // Quita las etiquetas de una ejecución anterior sobre esta mesa de trabajo.
    if (getLabelLayer(false)) {
        for (i = labelLayer.pageItems.length - 1; i >= 0; i--) {
            var lbb = labelLayer.pageItems[i].visibleBounds;
            if (lbb[0] < ab[2] && lbb[2] > ab[0] && lbb[3] < ab[1] && lbb[1] > ab[3]) labelLayer.pageItems[i].remove();
        }
    }

    // Cada copia es un rectángulo independiente (diseño + etiqueta).
    var copies = [], packItems = [], sz, ls;
    for (i = 0; i < rows.length; i++) {
        ls = rows[i].label ? labelSize[rows[i].label] : null;
        sz = Utils.labeledSize(rows[i].piece.w, rows[i].piece.h, ls && ls.w, ls && ls.h, opts.labelOffset);
        for (j = 0; j < rows[i].qty; j++) {
            packItems.push({ id: copies.length, w: sz.w, h: sz.h });
            copies.push({ piece: rows[i].piece, label: rows[i].label });
        }
    }

    var progressWin = new ProgressWindow();
    var packOpts = {
        width: opts.mode === "strip" ? opts.width : abW,
        height: abH,
        gap: opts.gap,
        margin: opts.margin,
        allowRotate: opts.rotation > 0,
        quality: ["fast", "normal", "best"][opts.quality],
        onProgress: function (d, t, m) { progressWin.update(d, t, m); }
    };
    var result;
    try {
        result = opts.mode === "strip" ? Packer.packStrip(packItems, packOpts) : Packer.packFixed(packItems, packOpts);
    } finally {
        progressWin.close();
    }

    // Largo final y ubicación de la hoja, ANTES de mover nada. El lienzo de
    // Illustrator es un cuadrado fijo (~577 cm) y la mesa de trabajo no puede
    // salirse de él; si la hoja no cabe hacia abajo, se sube lo necesario.
    var u = opts.unit, kk = UNITS[u];
    var sheetW = packOpts.width, sheetH = abH, warn = "", lengthNote = "";
    var originX = ab[0], originY = ab[1];
    if (opts.mode === "strip") {
        sheetH = result.height;
        if (opts.resize) {
            var pick = Utils.pickLength(result.height, opts.lengthMode, stdPt, kk);
            sheetH = pick.length;
            if (pick.standard) lengthNote = " (tamaño estándar; contenido: " + round(result.height / kk, 2) + " " + u + ")";
            if (pick.exceeded) lengthNote = " (supera el mayor largo estándar)";
        }
        var sizeTxt = round(sheetW / kk, 1) + " x " + round(sheetH / kk, 1) + " " + u;
        if (sheetW > MAX_CANVAS - 1 || sheetH > MAX_CANVAS - 1) {
            alert("El acomodo necesita una hoja de " + sizeTxt + ", pero Illustrator admite como máximo " +
                round(MAX_CANVAS / kk, 1) + " " + u + " por lado.\n\nReduce las copias o divide el pedido en " +
                "varias hojas. No se modificó nada.", SCRIPT_NAME);
            dropEmptyLabelLayer();
            return;
        }
        var top = fitOnCanvas(artboard, ab, sheetW, opts.resize ? sheetH : Math.max(sheetH, abH));
        if (top === null) {
            alert("No se pudo ubicar una hoja de " + sizeTxt + " dentro del lienzo de Illustrator.\n\n" +
                "Prueba en un documento nuevo o con la mesa de trabajo más cerca del centro del lienzo. " +
                "No se modificó nada.", SCRIPT_NAME);
            dropEmptyLabelLayer();
            return;
        }
        originY = top;
        if (opts.resize) {
            artboard.artboardRect = [originX, originY, originX + sheetW, originY - sheetH];
        } else {
            // Sin ajustar: la mesa conserva su tamaño, solo se desplaza si hizo falta.
            artboard.artboardRect = [ab[0], originY, ab[2], originY - abH];
            if (Math.abs(originY - ab[1]) > 0.5) lengthNote += "\n(La mesa de trabajo se desplazó hacia arriba para que la hoja quepa en el lienzo.)";
        }
        if (opts.resize && Math.abs(originY - ab[1]) > 0.5) {
            lengthNote += "\n(La mesa de trabajo se subió para que la hoja quepa en el lienzo de Illustrator.)";
        }
    }

    // Crear las copias necesarias ANTES de girar/mover el original.
    var placedCount = [];
    for (i = 0; i < pieces.length; i++) placedCount.push(0);
    for (i = 0; i < result.placements.length; i++) placedCount[copies[result.placements[i].id].piece.idx]++;
    for (i = 0; i < pieces.length; i++) {
        pieces[i].instances = [pieces[i].item];
        for (j = 1; j < placedCount[i]; j++) pieces[i].instances.push(pieces[i].item.duplicate());
    }

    // Aplicar posiciones
    var angle = opts.rotation === 2 ? 90 : -90; // Illustrator: positivo = antihorario
    var dir = opts.rotation === 2 ? "ccw" : "cw";

    // Centra un objeto dentro de un hueco (coordenadas de pantalla relativas a la hoja).
    function placeCentered(obj, r) {
        var b = getBounds(obj), bw = b[2] - b[0], bh = b[1] - b[3];
        obj.translate(originX + r.x + (r.w - bw) / 2 - b[0], originY - r.y - (r.h - bh) / 2 - b[1]);
    }

    var p, cp, piece, item, slots, tf, usedArea = 0, sizeCount = {}, sizeOrder = [];
    for (i = 0; i < result.placements.length; i++) {
        p = result.placements[i];
        cp = copies[p.id];
        piece = cp.piece;
        ls = cp.label ? labelSize[cp.label] : null;
        slots = Utils.labelSlots(p, piece.w, piece.h, ls && ls.w, ls && ls.h, opts.labelOffset, dir);
        item = piece.instances.shift();
        if (p.rotated) item.rotate(angle, true, true, true, true, Transformation.CENTER);
        placeCentered(item, slots.design);
        // La talla queda en la nota del objeto para conservarla si se vuelve a acomodar.
        try { item.note = Utils.noteWithLabel(item.note, cp.label); } catch (e) { }
        if (slots.label) {
            tf = makeLabel(cp.label);
            if (p.rotated) tf.rotate(angle, true, true, true, true, Transformation.CENTER);
            placeCentered(tf, slots.label);
            if (!sizeCount[cp.label]) { sizeCount[cp.label] = 0; sizeOrder.push(cp.label); }
            sizeCount[cp.label]++;
        }
        usedArea += piece.w * piece.h;
    }

    // Diseños sin ninguna copia acomodada: el original se aparta a la derecha.
    var leftovers = [], missingCopies = 0;
    for (i = 0; i < pieces.length; i++) {
        missingCopies += pieces[i].total - placedCount[i];
        if (!placedCount[i]) leftovers.push(pieces[i]);
    }
    if (leftovers.length) {
        var colX = ab[2] + 36, curY = originY, colW = 0, nb;
        for (i = 0; i < leftovers.length; i++) {
            piece = leftovers[i];
            nb = getBounds(piece.item);
            if (curY - piece.h < originY - Math.max(abH, 2000) && curY !== originY) {
                colX += colW + 36; curY = originY; colW = 0;
            }
            piece.item.translate(colX - nb[0], curY - nb[1]);
            curY -= piece.h + 36;
            if (piece.w > colW) colW = piece.w;
        }
    }
    if (labelLayer) {
        labelLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
        if (!labelLayer.pageItems.length && !usesLabels) labelLayer.remove();
    }

    // Selección final: los diseños que no cupieron, para localizarlos fácil.
    doc.selection = null;
    for (i = 0; i < leftovers.length; i++) leftovers[i].item.selected = true;

    var msg = "Piezas acomodadas: " + result.placements.length + " de " + packItems.length +
        " (" + pieces.length + " diseño(s))" +
        "\nHoja: " + round(sheetW / kk, 2) + " x " + round(sheetH / kk, 2) + " " + u + lengthNote +
        "\nAprovechamiento: " + round(usedArea / (sheetW * sheetH) * 100, 1) + " %";
    if (opts.price > 0) {
        var c = Utils.cost(sheetH, opts.price, PRICE_UNITS[opts.priceUnit]);
        msg += "\nCosto estimado: " + opts.currency + round(c, 2).toFixed(2) +
            " (" + opts.currency + opts.price + " por " + opts.priceUnit + ")";
    }
    if (sizeOrder.length) {
        var parts = [];
        for (i = 0; i < sizeOrder.length; i++) parts.push(sizeOrder[i] + " \u00D7" + sizeCount[sizeOrder[i]]);
        msg += "\nTallas: " + parts.join(", ");
    }
    msg += preflightNote;
    if (missingCopies) {
        msg += "\n\nNo cupieron " + missingCopies + " pieza(s).";
        if (leftovers.length) msg += " Los diseños sin ninguna copia acomodada quedaron seleccionados a la derecha de la mesa de trabajo.";
        if (missingCopies > leftovers.length) msg += " Las copias extra que no cupieron no se crearon.";
    }

    // Exportar PNG
    if (opts.exportPng) {
        if (warn) {
            msg += "\n\nNo se exportó el PNG porque la mesa de trabajo no se pudo ajustar.";
        } else {
            var target = exportTarget(round(sheetW / kk, 1) + "x" + round(sheetH / kk, 1) + u);
            if (target) {
                var pxW = Math.round(sheetW / 72 * opts.ppi), pxH = Math.round(sheetH / 72 * opts.ppi);
                var exp = exportPng(abIndex, target, opts.ppi);
                if (exp.file && usesLabels) msg += "\n\nEl PNG incluye las etiquetas de talla (capa \"" + LABEL_LAYER + "\").";
                msg += exp.file ?
                    "\n\nPNG exportado (" + pxW + " x " + pxH + " px):\n" + decodeURI(exp.file.fsName) :
                    "\n\nNo se pudo exportar el PNG: " + exp.error;
            }
        }
    }

    alert(msg + warn, SCRIPT_NAME);
})();
