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
    // Integración con Illustrator
    // =====================================================================
    var SCRIPT_NAME = "AutoSort Gangsheet DTF";
    var UNITS = { mm: 2.834645669, cm: 28.34645669, "in": 72 };
    var UNIT_NAMES = ["mm", "cm", "in"];
    var MAX_CANVAS = 16383; // pt, límite de una mesa de trabajo
    var CONFIG_FILE = File(Folder.userData + "/AutoSortGangsheetDTF.cfg");

    if (app.documents.length === 0) {
        alert("Abre un documento antes de ejecutar " + SCRIPT_NAME + ".", SCRIPT_NAME);
        return;
    }
    var doc = app.activeDocument;

    // ----------------------------- Utilidades ---------------------------
    function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }

    function parseNum(s) {
        var v = parseFloat(String(s).replace(",", "."));
        return isNaN(v) ? null : v;
    }

    function loadConfig() {
        var cfg = {
            unit: "cm", mode: "strip", width: null, gap: 0.3, margin: 0.3, rotation: 1,
            quality: 1, resize: true, roundUp: false, source: "selection"
        };
        try {
            if (CONFIG_FILE.exists && CONFIG_FILE.open("r")) {
                var saved = eval(CONFIG_FILE.read());
                CONFIG_FILE.close();
                for (var k in saved) if (saved.hasOwnProperty(k)) cfg[k] = saved[k];
            }
        } catch (e) { }
        if (!UNITS[cfg.unit]) cfg.unit = "cm";
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
            if (layer.locked || !layer.visible) return false;
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
            if (layer.locked || !layer.visible) return;
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

    // ------------------------------ Diálogo -----------------------------
    function showDialog(cfg, info) {
        var unit = cfg.unit;
        var w = new Window("dialog", SCRIPT_NAME);
        w.orientation = "column";
        w.alignChildren = "fill";

        // Elementos
        var pItems = w.add("panel", undefined, "Elementos a acomodar");
        pItems.alignChildren = "left";
        var rbSel = pItems.add("radiobutton", undefined, "Selección actual (" + info.selCount + " piezas)");
        var rbAll = pItems.add("radiobutton", undefined, "Todo lo visible y desbloqueado (" + info.allCount + " piezas)");
        pItems.add("statictext", undefined, "Cada grupo cuenta como una sola pieza.");
        rbSel.enabled = info.selCount > 0;
        rbSel.onClick = function () { rbAll.value = false; };
        rbAll.onClick = function () { rbSel.value = false; };
        if (cfg.source === "all" || !info.selCount) rbAll.value = true; else rbSel.value = true;

        // Unidades
        var gUnit = w.add("group");
        gUnit.add("statictext", undefined, "Unidades:");
        var ddUnit = gUnit.add("dropdownlist", undefined, UNIT_NAMES);
        for (var u = 0; u < UNIT_NAMES.length; u++) if (UNIT_NAMES[u] === unit) ddUnit.selection = u;

        function numRow(parent, label, value) {
            var g = parent.add("group");
            var st = g.add("statictext", undefined, label);
            st.preferredSize.width = 150;
            var et = g.add("edittext", undefined, String(value));
            et.characters = 8;
            var lu = g.add("statictext", undefined, unit);
            lu.characters = 3;
            return { edit: et, unitLabel: lu, group: g };
        }

        // Lienzo
        var pSheet = w.add("panel", undefined, "Lienzo");
        pSheet.alignChildren = "left";
        var rbStrip = pSheet.add("radiobutton", undefined, "Ancho fijo, largo automático (rollo DTF)");
        var rowW = numRow(pSheet, "    Ancho de la hoja:", round(cfg.width / UNITS[unit], 3));
        var cbResize = pSheet.add("checkbox", undefined, "    Ajustar la mesa de trabajo al resultado");
        var cbRound = pSheet.add("checkbox", undefined, "    Redondear el largo hacia arriba a unidad entera");
        var rbFixed = pSheet.add("radiobutton", undefined,
            "Mesa de trabajo actual (" + round(info.abW / UNITS[unit], 2) + " x " + round(info.abH / UNITS[unit], 2) + " " + unit + ")");
        cbResize.value = cfg.resize;
        cbRound.value = cfg.roundUp;

        function syncMode() {
            var strip = rbStrip.value;
            rowW.group.enabled = strip;
            cbResize.enabled = strip;
            cbRound.enabled = strip && cbResize.value;
        }
        rbStrip.onClick = function () { rbFixed.value = false; syncMode(); };
        rbFixed.onClick = function () { rbStrip.value = false; syncMode(); };
        cbResize.onClick = syncMode;
        if (cfg.mode === "fixed") rbFixed.value = true; else rbStrip.value = true;

        // Separación
        var pGap = w.add("panel", undefined, "Separación para recorte");
        pGap.alignChildren = "left";
        var rowGap = numRow(pGap, "Entre elementos:", round(cfg.gap / UNITS[unit], 3));
        var rowMargin = numRow(pGap, "Margen al borde:", round(cfg.margin / UNITS[unit], 3));

        // Opciones
        var pOpt = w.add("panel", undefined, "Opciones");
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

        // Conversión al cambiar unidades
        var rows = [rowW, rowGap, rowMargin];
        ddUnit.onChange = function () {
            var nu = UNIT_NAMES[ddUnit.selection.index], i, v;
            for (i = 0; i < rows.length; i++) {
                v = parseNum(rows[i].edit.text);
                if (v !== null) rows[i].edit.text = String(round(v * UNITS[unit] / UNITS[nu], 3));
                rows[i].unitLabel.text = nu;
            }
            rbFixed.text = "Mesa de trabajo actual (" + round(info.abW / UNITS[nu], 2) + " x " +
                round(info.abH / UNITS[nu], 2) + " " + nu + ")";
            unit = nu;
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
            if (gap === null || gap < 0) { alert("La separación entre elementos no es válida."); return; }
            if (margin === null || margin < 0) { alert("El margen al borde no es válido."); return; }
            if (rbStrip.value && (width === null || width <= 0)) { alert("El ancho de la hoja no es válido."); return; }
            if (!rbSel.value && !rbAll.value) { alert("Elige qué elementos acomodar."); return; }
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
                roundUp: cbRound.value
            };
            w.close(1);
        };

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

    // ------------------------------ Principal ---------------------------
    var abIndex = doc.artboards.getActiveArtboardIndex();
    var artboard = doc.artboards[abIndex];
    var ab = artboard.artboardRect; // [izq, arriba, der, abajo]
    var abW = ab[2] - ab[0], abH = ab[1] - ab[3];

    var selItems = collectSelection();
    var allItems = collectAll();
    if (!selItems.length && !allItems.length) {
        alert("No hay elementos visibles y desbloqueados para acomodar.", SCRIPT_NAME);
        return;
    }

    var cfg = loadConfig();
    if (!cfg.width) cfg.width = abW;
    if (!selItems.length) cfg.source = "all";

    var opts = showDialog(cfg, { selCount: selItems.length, allCount: allItems.length, abW: abW, abH: abH });
    if (!opts) return;
    saveConfig(opts);

    var items = opts.source === "selection" ? selItems : allItems;
    var pieces = [], skipped = 0, i, b;
    for (i = 0; i < items.length; i++) {
        b = getBounds(items[i]);
        var pw = b[2] - b[0], ph = b[1] - b[3];
        if (pw <= 0.01 || ph <= 0.01) { skipped++; continue; }
        pieces.push({ id: pieces.length, item: items[i], w: pw, h: ph });
    }
    if (!pieces.length) {
        alert("Los elementos seleccionados no tienen tamaño medible.", SCRIPT_NAME);
        return;
    }

    var packItems = [];
    for (i = 0; i < pieces.length; i++) packItems.push({ id: pieces[i].id, w: pieces[i].w, h: pieces[i].h });

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

    // Aplicar posiciones
    var angle = opts.rotation === 2 ? 90 : -90; // Illustrator: positivo = antihorario
    var originX = ab[0], originY = ab[1];
    var p, piece, nb, usedArea = 0;
    for (i = 0; i < result.placements.length; i++) {
        p = result.placements[i];
        piece = pieces[p.id];
        if (p.rotated) piece.item.rotate(angle, true, true, true, true, Transformation.CENTER);
        nb = getBounds(piece.item);
        piece.item.translate((originX + p.x) - nb[0], (originY - p.y) - nb[1]);
        usedArea += piece.w * piece.h;
    }

    // Lo que no cupo se apila a la derecha de la mesa de trabajo.
    var leftovers = [];
    if (result.unplaced.length) {
        var colX = ab[2] + 36, curY = originY, colW = 0;
        for (i = 0; i < result.unplaced.length; i++) {
            piece = pieces[result.unplaced[i]];
            nb = getBounds(piece.item);
            if (curY - piece.h < originY - Math.max(abH, 2000) && curY !== originY) {
                colX += colW + 36; curY = originY; colW = 0;
            }
            piece.item.translate(colX - nb[0], curY - nb[1]);
            curY -= piece.h + 36;
            if (piece.w > colW) colW = piece.w;
            leftovers.push(piece.item);
        }
    }

    // Ajustar mesa de trabajo (modo rollo)
    var sheetW = packOpts.width, sheetH = opts.mode === "strip" ? result.height : abH, warn = "";
    if (opts.mode === "strip" && opts.resize) {
        if (opts.roundUp) {
            var k = UNITS[opts.unit];
            sheetH = Math.ceil(sheetH / k - 1e-6) * k;
        }
        if (sheetW > MAX_CANVAS || sheetH > MAX_CANVAS) {
            warn = "\n\nAVISO: la hoja mide más que el máximo de una mesa de trabajo de Illustrator " +
                "(" + round(MAX_CANVAS / UNITS[opts.unit], 1) + " " + opts.unit + "), así que no se ajustó.";
        } else {
            artboard.artboardRect = [originX, originY, originX + sheetW, originY - sheetH];
        }
    }

    // Selección final: lo que no cupo (para localizarlo fácil) o todo lo acomodado.
    doc.selection = null;
    if (leftovers.length) {
        for (i = 0; i < leftovers.length; i++) leftovers[i].selected = true;
    }

    var u = opts.unit, kk = UNITS[u];
    var msg = "Piezas acomodadas: " + result.placements.length + " de " + pieces.length +
        "\nHoja: " + round(sheetW / kk, 2) + " x " + round(sheetH / kk, 2) + " " + u +
        "\nAprovechamiento: " + round(usedArea / (sheetW * sheetH) * 100, 1) + " %";
    if (result.unplaced.length) {
        msg += "\n\nNo cupieron " + result.unplaced.length +
            " pieza(s); quedaron seleccionadas a la derecha de la mesa de trabajo.";
    }
    if (skipped) msg += "\n\nSe omitieron " + skipped + " elemento(s) sin tamaño.";
    alert(msg + warn, SCRIPT_NAME);
})();
