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
        // Obstáculos (coordenadas de la hoja) convertidos al contenedor: se
        // ensanchan con la separación para que las piezas la respeten.
        function obstacleNodes(list, margin, gap, binW, binH) {
            var out = [], bottom = 0, i, o, x1, y1, x2, y2;
            for (i = 0; list && i < list.length; i++) {
                o = list[i];
                x1 = Math.max(0, o.x - margin);
                y1 = Math.max(0, o.y - margin);
                x2 = Math.min(binW, o.x + o.w - margin + gap);
                y2 = Math.min(binH, o.y + o.h - margin + gap);
                if (x2 - x1 <= EPS || y2 - y1 <= EPS) continue;
                out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
                if (y2 > bottom) bottom = y2;
            }
            return { nodes: out, bottom: bottom };
        }

        function run(rects, binW, binH, combo, minDim, failFast, obst) {
            var bin = new Bin(binW, binH, combo.rot, minDim);
            var placed = [], unplaced = [], usedH = 0, i, r, node, order;
            if (obst) {
                for (i = 0; i < obst.nodes.length; i++) bin.place(obst.nodes[i]);
                usedH = obst.bottom;
            }
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
            var obst = obstacleNodes(opts.obstacles, margin, gap, binW, HUGE);

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
            if (obst.bottom > lo) lo = obst.bottom;

            // Sin girar no se puede si alguna pieza solo cabe girada.
            var canSkipRot = true;
            for (i = 0; i < rects.length; i++) if (rects[i].w > binW + EPS) canSkipRot = false;
            var combos = buildCombos(opts.quality, opts.allowRotate, opts.quality === "best" && canSkipRot);
            var tol = opts.tolerance || 2.834645669; // 1 mm
            var maxIter = 14, total = combos.length * (1 + maxIter), done = 0;
            var best = null, res, c;

            // 1) Cota superior con un contenedor "infinito".
            for (c = 0; c < combos.length; c++) {
                res = run(rects, binW, sumH + obst.bottom + 1, combos[c], prep.minDim, false, obst);
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
                    res = run(rects, binW, mid, combos[c], prep.minDim, true, obst);
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
        // Mejor resultado en hoja fija: más piezas (o más área si preferArea,
        // útil al llenar hojas sucesivas) y, a igualdad, menos alto usado.
        function fixedBetter(a, b, preferArea) {
            var na = a.placed.length, nb = b.placed.length;
            if (preferArea) {
                if (a.area > b.area + EPS) return true;
                if (a.area < b.area - EPS) return false;
                if (na !== nb) return na > nb;
            } else {
                if (na !== nb) return na > nb;
                if (a.area > b.area + EPS) return true;
                if (a.area < b.area - EPS) return false;
            }
            return a.usedH < b.usedH - EPS;
        }

        function packFixed(items, opts) {
            var gap = opts.gap || 0, margin = opts.margin || 0;
            var binW = opts.width - 2 * margin + gap;
            var binH = opts.height - 2 * margin + gap;
            var prep = prepare(items, binW, binH, gap, opts.allowRotate);
            if (!prep.rects.length) return { placements: [], unplaced: prep.tooBig, height: opts.height };

            var combos = buildCombos(opts.quality, opts.allowRotate, true), best = null, res, c;
            var obst = obstacleNodes(opts.obstacles, margin, gap, binW, binH);
            for (c = 0; c < combos.length; c++) {
                res = run(prep.rects, binW, binH, combos[c], prep.minDim, false, obst);
                if (!best || fixedBetter(res, best, opts.preferArea)) best = res;
                progress(opts, c + 1, combos.length, "Probando acomodos");
            }
            return toResult(best, margin, gap, opts.height, prep.tooBig);
        }

        // ---------------------------------------------------------------
        // Varias hojas: llena hojas de width x height una tras otra con lo
        // que no cupo en la anterior.
        // opts: {width, height, gap, margin, allowRotate, quality, strip,
        //        maxSheets, onProgress, obstacles (solo hoja 1),
        //        obstaclesEvery (en todas las hojas)}
        // strip = true: la última hoja se acorta al largo mínimo y cada hoja
        //               reporta su largo usado.
        // Devuelve {sheets: [{placements, height}], unplaced: [ids]}
        // ---------------------------------------------------------------
        function packSheets(items, opts) {
            var gap = opts.gap || 0, margin = opts.margin || 0;
            var binW = opts.width - 2 * margin + gap, binH = opts.height - 2 * margin + gap;
            var remaining = items.slice(0), sheets = [], maxSheets = opts.maxSheets || 100;
            var res, i, area, left, sub, k, maxBottom, n;

            function subOpts(n) {
                var o = {}, key;
                for (key in opts) if (opts.hasOwnProperty(key)) o[key] = opts[key];
                o.preferArea = true;
                o.obstacles = (opts.obstaclesEvery || []).concat(n === 1 ? (opts.obstacles || []) : []);
                o.onProgress = function (d, t, m) {
                    if (opts.onProgress) opts.onProgress(d, t, "Hoja " + n + ": " + m);
                };
                return o;
            }

            while (remaining.length && sheets.length < maxSheets) {
                n = sheets.length + 1;
                sub = subOpts(n);
                if (opts.strip) {
                    // ¿Cabe todo lo que queda en una hoja más corta? (solo si el
                    // área lo permite, para no gastar tiempo)
                    area = 0;
                    for (i = 0; i < remaining.length; i++) area += (remaining[i].w + gap) * (remaining[i].h + gap);
                    if (area / binW <= binH + EPS) {
                        res = packStrip(remaining, sub);
                        if (res.height <= opts.height + EPS && res.placements.length) {
                            sheets.push({ placements: res.placements, height: res.height });
                            return { sheets: sheets, unplaced: res.unplaced };
                        }
                    }
                }
                res = packFixed(remaining, sub);
                if (!res.placements.length) break;
                maxBottom = 0;
                for (i = 0; i < res.placements.length; i++) {
                    if (res.placements[i].y + res.placements[i].h > maxBottom) maxBottom = res.placements[i].y + res.placements[i].h;
                }
                sheets.push({ placements: res.placements, height: opts.strip ? maxBottom + margin : opts.height });
                left = {};
                for (i = 0; i < res.unplaced.length; i++) left[res.unplaced[i]] = true;
                k = [];
                for (i = 0; i < remaining.length; i++) if (left[remaining[i].id]) k.push(remaining[i]);
                remaining = k;
            }
            var ids = [];
            for (i = 0; i < remaining.length; i++) ids.push(remaining[i].id);
            return { sheets: sheets, unplaced: ids };
        }

        return { packStrip: packStrip, packFixed: packFixed, packSheets: packSheets, Bin: Bin };
    })();
    // === PACKER END ===

    // =====================================================================
    // === NEST START ===
    // Acomodo por forma real ("nesting") sobre una cuadrícula. Cada diseño se
    // representa como una máscara de celdas ocupadas (obtenida de una captura
    // PNG con transparencia). Incluye un decodificador PNG/zlib mínimo porque
    // ExtendScript no puede leer píxeles. Independiente de Illustrator.
    // =====================================================================
    var Nest = (function () {

        // ------------------------- zlib inflate -------------------------
        // Adaptación a ES3 de tiny-inflate (MIT, Devon Govett / Joergen Ibsen).
        function zeros(n) { var a = [], i; for (i = 0; i < n; i++) a.push(0); return a; }
        function Tree() { this.table = zeros(16); this.trans = zeros(288); }

        var sltree = new Tree(), sdtree = new Tree(), ltree = new Tree(), dtree = new Tree(), codeTree = new Tree();
        var lengthBits = zeros(30), lengthBase = zeros(30), distBits = zeros(30), distBase = zeros(30);
        var clcidx = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        var lengths = zeros(288 + 32), offs = zeros(16);

        function buildBitsBase(bits, base, delta, first) {
            var i, sum;
            for (i = 0; i < delta; ++i) bits[i] = 0;
            for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;
            for (sum = first, i = 0; i < 30; ++i) { base[i] = sum; sum += 1 << bits[i]; }
        }

        function buildFixedTrees(lt, dt) {
            var i;
            for (i = 0; i < 7; ++i) lt.table[i] = 0;
            lt.table[7] = 24; lt.table[8] = 152; lt.table[9] = 112;
            for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
            for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
            for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
            for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;
            for (i = 0; i < 5; ++i) dt.table[i] = 0;
            dt.table[5] = 32;
            for (i = 0; i < 32; ++i) dt.trans[i] = i;
        }

        // Nota: ExtendScript interpreta mal "++"/"--" sobre propiedades dentro
        // de una expresión (p. ej. "!d.bitcount--"), por eso aquí se usan pasos
        // explícitos.
        function buildTree(t, lens, off, num) {
            var i, sum, len;
            for (i = 0; i < 16; ++i) t.table[i] = 0;
            for (i = 0; i < num; ++i) t.table[lens[off + i]] += 1;
            t.table[0] = 0;
            for (sum = 0, i = 0; i < 16; ++i) { offs[i] = sum; sum += t.table[i]; }
            for (i = 0; i < num; ++i) {
                len = lens[off + i];
                if (len) { t.trans[offs[len]] = i; offs[len] += 1; }
            }
        }

        function nextByte(d) {
            var v = d.s[d.i] | 0;
            d.i += 1;
            return v;
        }

        function getBit(d) {
            if (d.bitcount === 0) { d.tag = nextByte(d); d.bitcount = 8; }
            d.bitcount -= 1;
            var bit = d.tag & 1;
            d.tag >>>= 1;
            return bit;
        }

        function readBits(d, num, base) {
            if (!num) return base;
            while (d.bitcount < 24) { d.tag |= nextByte(d) << d.bitcount; d.bitcount += 8; }
            var val = d.tag & (0xffff >>> (16 - num));
            d.tag >>>= num;
            d.bitcount -= num;
            return val + base;
        }

        function decodeSymbol(d, t) {
            while (d.bitcount < 24) { d.tag |= nextByte(d) << d.bitcount; d.bitcount += 8; }
            var sum = 0, cur = 0, len = 0, tag = d.tag;
            do {
                cur = 2 * cur + (tag & 1);
                tag >>>= 1;
                ++len;
                sum += t.table[len];
                cur -= t.table[len];
            } while (cur >= 0);
            d.tag = tag;
            d.bitcount -= len;
            return t.trans[sum + cur];
        }

        function decodeTrees(d, lt, dt) {
            var hlit = readBits(d, 5, 257), hdist = readBits(d, 5, 1), hclen = readBits(d, 4, 4);
            var i, num, length, sym, prev;
            for (i = 0; i < 19; ++i) lengths[i] = 0;
            for (i = 0; i < hclen; ++i) lengths[clcidx[i]] = readBits(d, 3, 0);
            buildTree(codeTree, lengths, 0, 19);
            for (num = 0; num < hlit + hdist;) {
                sym = decodeSymbol(d, codeTree);
                if (sym === 16) {
                    prev = lengths[num - 1];
                    for (length = readBits(d, 2, 3); length; --length) lengths[num++] = prev;
                } else if (sym === 17) {
                    for (length = readBits(d, 3, 3); length; --length) lengths[num++] = 0;
                } else if (sym === 18) {
                    for (length = readBits(d, 7, 11); length; --length) lengths[num++] = 0;
                } else {
                    lengths[num++] = sym;
                }
            }
            buildTree(lt, lengths, 0, hlit);
            buildTree(dt, lengths, hlit, hdist);
        }

        function inflateBlockData(d, lt, dt) {
            var out = d.out, sym, length, dist, start, i;
            for (;;) {
                sym = decodeSymbol(d, lt);
                if (sym === 256) return;
                if (sym < 256) { out.push(sym); continue; }
                sym -= 257;
                length = readBits(d, lengthBits[sym], lengthBase[sym]);
                dist = decodeSymbol(d, dt);
                start = out.length - readBits(d, distBits[dist], distBase[dist]);
                for (i = start; i < start + length; ++i) out.push(out[i]);
            }
        }

        function inflateUncompressed(d) {
            var length, i;
            while (d.bitcount > 8) { d.i -= 1; d.bitcount -= 8; }
            length = 256 * d.s[d.i + 1] + d.s[d.i];
            d.i += 4;
            for (i = length; i; --i) d.out.push(nextByte(d));
            d.bitcount = 0;
        }

        // bytes: arreglo de 0..255 (flujo zlib completo).
        function inflate(bytes) {
            var d = { s: bytes, i: 2, tag: 0, bitcount: 0, out: [] }, bfinal, btype;
            do {
                bfinal = getBit(d);
                btype = readBits(d, 2, 0);
                if (btype === 0) inflateUncompressed(d);
                else if (btype === 1) inflateBlockData(d, sltree, sdtree);
                else if (btype === 2) { decodeTrees(d, ltree, dtree); inflateBlockData(d, ltree, dtree); }
                else throw new Error("PNG: bloque comprimido inválido");
                if (d.i > bytes.length + 4) throw new Error("PNG: datos incompletos");
            } while (!bfinal);
            return d.out;
        }

        buildFixedTrees(sltree, sdtree);
        buildBitsBase(lengthBits, lengthBase, 4, 3);
        buildBitsBase(distBits, distBase, 2, 1);
        lengthBits[28] = 0;
        lengthBase[28] = 258;

        // ----------------------------- PNG ------------------------------
        function toBytes(s) {
            if (typeof s !== "string") return s;
            var out = [], i;
            for (i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
            return out;
        }

        function u32(b, p) { return ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]; }

        // Decodifica cualquier PNG estándar: profundidad 1, 2, 4, 8 o 16 bits,
        // tipos de color gris, RGB, paleta, gris+alfa y RGBA, entrelazado Adam7
        // y transparencia por tRNS. Devuelve {width, height, r, g, b, alpha}
        // con valores de 0 a 255 por píxel.
        function decodePng(data) {
            var bytes = toBytes(data), sig = [137, 80, 78, 71, 13, 10, 26, 10], i, p = 8;
            for (i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error("No es un PNG");
            var w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, idat = [], trns = null, plte = null, len, type;
            while (p + 8 <= bytes.length) {
                len = u32(bytes, p);
                type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
                if (type === "IHDR") {
                    w = u32(bytes, p + 8); h = u32(bytes, p + 12);
                    depth = bytes[p + 16]; ctype = bytes[p + 17]; interlace = bytes[p + 20];
                } else if (type === "PLTE") {
                    plte = bytes.slice(p + 8, p + 8 + len);
                } else if (type === "tRNS") {
                    trns = bytes.slice(p + 8, p + 8 + len);
                } else if (type === "IDAT") {
                    for (i = 0; i < len; i++) idat.push(bytes[p + 8 + i]);
                } else if (type === "IEND") {
                    break;
                }
                p += 12 + len;
            }
            if (!w || !h) throw new Error("PNG sin encabezado");
            var ch = [1, 0, 3, 1, 2, 0, 4][ctype]; // canales por tipo de color
            if (!ch || (depth !== 1 && depth !== 2 && depth !== 4 && depth !== 8 && depth !== 16)) {
                throw new Error("PNG no soportado (tipo " + ctype + ", " + depth + " bits)");
            }
            if (ctype === 3 && !plte) throw new Error("PNG con paleta sin PLTE");
            var bits = ch * depth, bpp = Math.max(1, Math.ceil(bits / 8));
            var maxv = (1 << Math.min(depth, 8)) - 1; // para escalar 1/2/4 bits a 0..255
            var raw = inflate(idat), pos = 0;
            var R = zeros(w * h), G = zeros(w * h), B = zeros(w * h), A = zeros(w * h);
            // Clave de transparencia (tRNS) para gris y RGB, en 16 bits.
            var key = null;
            if (trns && ctype === 0 && trns.length >= 2) key = [(trns[0] << 8) | trns[1]];
            if (trns && ctype === 2 && trns.length >= 6) key = [(trns[0] << 8) | trns[1], (trns[2] << 8) | trns[3], (trns[4] << 8) | trns[5]];

            // Lee la muestra n (0 = primera) del píxel x de la fila; valor crudo.
            function sample(row, x, n) {
                var bitPos, byteIdx, shift;
                if (depth === 8) return row[x * ch + n];
                if (depth === 16) return (row[(x * ch + n) * 2] << 8) | row[(x * ch + n) * 2 + 1];
                bitPos = (x * ch + n) * depth;
                byteIdx = bitPos >> 3;
                shift = 8 - depth - (bitPos & 7);
                return (row[byteIdx] >> shift) & ((1 << depth) - 1);
            }
            function to8(v) {
                if (depth === 16) return v >> 8;
                if (depth === 8) return v;
                return Math.round(v * 255 / maxv);
            }
            function setPixel(row, x, px) {
                var s0 = sample(row, x, 0), k, r, g, bl, a = 255;
                if (ctype === 3) {
                    k = s0 * 3;
                    r = plte[k] | 0; g = plte[k + 1] | 0; bl = plte[k + 2] | 0;
                    if (trns && s0 < trns.length) a = trns[s0];
                } else if (ctype === 0 || ctype === 4) {
                    r = g = bl = to8(s0);
                    if (ctype === 4) a = to8(sample(row, x, 1));
                    else if (key && (depth === 16 ? s0 : s0) === key[0]) a = 0;
                } else {
                    var s1 = sample(row, x, 1), s2 = sample(row, x, 2);
                    r = to8(s0); g = to8(s1); bl = to8(s2);
                    if (ctype === 6) a = to8(sample(row, x, 3));
                    else if (key && s0 === key[0] && s1 === key[1] && s2 === key[2]) a = 0;
                }
                R[px] = r; G[px] = g; B[px] = bl; A[px] = a;
            }
            // Decodifica una imagen (o una pasada de Adam7) de pw x ph.
            function pass(pw, ph, x0, y0, dx, dy) {
                var stride = Math.ceil(pw * bits / 8), prev = zeros(stride), cur, f, x, y, v, a, bb, c, pa, pb, pc;
                for (y = 0; y < ph; y++) {
                    f = raw[pos];
                    pos += 1;
                    cur = [];
                    for (x = 0; x < stride; x++) {
                        v = raw[pos] | 0;
                        pos += 1;
                        a = x >= bpp ? cur[x - bpp] : 0;
                        bb = prev[x];
                        c = x >= bpp ? prev[x - bpp] : 0;
                        if (f === 1) v += a;
                        else if (f === 2) v += bb;
                        else if (f === 3) v += (a + bb) >> 1;
                        else if (f === 4) {
                            pa = Math.abs(bb - c); pb = Math.abs(a - c); pc = Math.abs(a + bb - 2 * c);
                            v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
                        }
                        cur.push(v & 0xff);
                    }
                    for (x = 0; x < pw; x++) setPixel(cur, x, (y0 + y * dy) * w + x0 + x * dx);
                    prev = cur;
                }
            }
            if (!interlace) {
                pass(w, h, 0, 0, 1, 1);
            } else {
                var ad = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]], q, pw, ph;
                for (q = 0; q < 7; q++) {
                    pw = Math.ceil((w - ad[q][0]) / ad[q][2]);
                    ph = Math.ceil((h - ad[q][1]) / ad[q][3]);
                    if (pw > 0 && ph > 0) pass(pw, ph, ad[q][0], ad[q][1], ad[q][2], ad[q][3]);
                }
            }
            return { width: w, height: h, r: R, g: G, b: B, alpha: A };
        }

        // ---------------------------- Máscaras ---------------------------
        // mask: {w, h, d: [0/1] por filas}
        function emptyMask(w, h) { return { w: w, h: h, d: zeros(w * h) }; }

        function fullMask(w, h) {
            var m = emptyMask(w, h), i;
            for (i = 0; i < w * h; i++) m.d[i] = 1;
            return m;
        }

        // Reduce la imagen a una máscara de w x h celdas: una celda está
        // ocupada si cualquier píxel suyo tiene opacidad > threshold.
        function maskFromAlpha(img, w, h, threshold) {
            var m = emptyMask(w, h), px, py, cx, cy;
            for (py = 0; py < img.height; py++) {
                cy = Math.min(h - 1, Math.floor(py * h / img.height));
                for (px = 0; px < img.width; px++) {
                    if (img.alpha[py * img.width + px] > threshold) {
                        cx = Math.min(w - 1, Math.floor(px * w / img.width));
                        m.d[cy * w + cx] = 1;
                    }
                }
            }
            return m;
        }

        // Silueta de una captura. Si la imagen trae transparencia se usa el
        // alfa. Si es totalmente opaca (p. ej. un PNG/JPG con fondo blanco),
        // se detecta el color de fondo en el borde y se quita.
        // Devuelve {mask, mode: "alpha" | "fondo" | "rect" | "vacia"}.
        function maskFromImage(img, w, h, threshold, tol) {
            var W = img.width, H = img.height, i, x, y, idx;
            var x0 = W, y0 = H, x1 = -1, y1 = -1;
            // Recuadro de lo que se dibujó (la captura puede ser un poco más
            // grande que la imagen y dejar un margen transparente alrededor).
            for (y = 0; y < H; y++) {
                for (x = 0; x < W; x++) {
                    if (img.alpha[y * W + x] > threshold) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
                }
            }
            if (x1 < 0) return { mask: emptyMask(w, h), mode: "vacia" };
            var inside = (x1 - x0 + 1) * (y1 - y0 + 1), clear = 0;
            for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) if (img.alpha[y * W + x] <= threshold) clear += 1;
            // Es "opaca" solo si lo dibujado llena toda la captura (salvo el
            // margen del redondeo a celdas, de hasta 3 píxeles) sin huecos. Un
            // PNG con transparencia alrededor conserva su forma tal cual.
            var fills = x0 <= 1 && y0 <= 1 && x1 >= W - 4 && y1 >= H - 4;
            if (!fills || clear > inside * 0.002 || !img.r) return { mask: maskFromAlpha(img, w, h, threshold), mode: "alpha" };

            // Imagen opaca: el fondo es el color más repetido en su borde.
            tol = tol || 28;
            var votes = {}, best = null, key, border = [];
            for (x = x0; x <= x1; x++) { border.push(y0 * W + x); border.push(y1 * W + x); }
            for (y = y0 + 1; y < y1; y++) { border.push(y * W + x0); border.push(y * W + x1); }
            for (i = 0; i < border.length; i++) {
                key = (img.r[border[i]] >> 4) + "," + (img.g[border[i]] >> 4) + "," + (img.b[border[i]] >> 4);
                votes[key] = (votes[key] || 0) + 1;
                if (!best || votes[key] > votes[best]) best = key;
            }
            // Solo si el borde es mayormente de un color (si no, es una foto rectangular).
            if (votes[best] < border.length * 0.6) return { mask: maskFromAlpha(img, w, h, threshold), mode: "rect" };
            var ref = null;
            for (i = 0; i < border.length && !ref; i++) {
                key = (img.r[border[i]] >> 4) + "," + (img.g[border[i]] >> 4) + "," + (img.b[border[i]] >> 4);
                if (key === best) ref = [img.r[border[i]], img.g[border[i]], img.b[border[i]]];
            }
            var keyed = { width: W, height: H, alpha: zeros(W * H) };
            for (y = y0; y <= y1; y++) {
                for (x = x0; x <= x1; x++) {
                    idx = y * W + x;
                    if (Math.abs(img.r[idx] - ref[0]) > tol || Math.abs(img.g[idx] - ref[1]) > tol ||
                        Math.abs(img.b[idx] - ref[2]) > tol) keyed.alpha[idx] = 255;
                }
            }
            var m = maskFromAlpha(keyed, w, h, 0);
            if (!maskArea(m)) return { mask: maskFromAlpha(img, w, h, threshold), mode: "rect" };
            return { mask: m, mode: "fondo" };
        }

        function maskArea(m) {
            var n = 0, i;
            for (i = 0; i < m.d.length; i++) n += m.d[i];
            return n;
        }

        // Copia src dentro de dst con desplazamiento (ox, oy).
        function blit(dst, src, ox, oy) {
            var x, y;
            for (y = 0; y < src.h; y++) {
                for (x = 0; x < src.w; x++) {
                    if (src.d[y * src.w + x]) dst.d[(y + oy) * dst.w + x + ox] = 1;
                }
            }
        }

        // Gira k veces 90° en sentido antihorario (visual, Y hacia abajo).
        function rotateMask(m, k) {
            k = ((k % 4) + 4) % 4;
            var r = m, t, x, y;
            while (k--) {
                t = emptyMask(r.h, r.w);
                for (y = 0; y < r.h; y++) {
                    for (x = 0; x < r.w; x++) {
                        if (r.d[y * r.w + x]) t.d[(r.w - 1 - x) * t.w + y] = 1;
                    }
                }
                r = t;
            }
            return r;
        }

        // Tramos ocupados por fila: [[ini, fin, ini, fin...], ...]
        function rowRuns(m) {
            var rows = [], x, y, s, runs;
            for (y = 0; y < m.h; y++) {
                runs = [];
                x = 0;
                while (x < m.w) {
                    if (m.d[y * m.w + x]) {
                        s = x;
                        while (x < m.w && m.d[y * m.w + x]) x++;
                        runs.push(s, x - 1);
                    } else x++;
                }
                rows.push(runs);
            }
            return rows;
        }

        // Une tramos [a,b,...] desordenados en una lista ordenada sin traslapes.
        function mergeRuns(list) {
            var pairs = [], i, out = [];
            for (i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
            pairs.sort(function (p, q) { return p[0] - q[0]; });
            for (i = 0; i < pairs.length; i++) {
                if (out.length && pairs[i][0] <= out[out.length - 1] + 1) {
                    if (pairs[i][1] > out[out.length - 1]) out[out.length - 1] = pairs[i][1];
                } else out.push(pairs[i][0], pairs[i][1]);
            }
            return out;
        }

        // Núcleo de separación: dos celdas están en conflicto si la distancia
        // entre sus cuadros es menor que gap (o si son la misma celda).
        // Devuelve {r, ex}: ex[dy + r] = máximo |dx| en conflicto para ese dy.
        function kernel(gapPt, cellPt) {
            function conflict(dx, dy) {
                if (!dx && !dy) return true;
                var gx = Math.max(0, Math.abs(dx) - 1) * cellPt, gy = Math.max(0, Math.abs(dy) - 1) * cellPt;
                return gx * gx + gy * gy < gapPt * gapPt;
            }
            var r = 0, ex = [], dy, e;
            while (r < 1000 && conflict(0, r + 1)) r++;
            for (dy = -r; dy <= r; dy++) {
                e = 0;
                while (e < 1000 && conflict(e + 1, dy)) e++;
                ex.push(e);
            }
            return { r: r, ex: ex };
        }

        // Tramos de la máscara "engordada" con el núcleo (para probar choques).
        function dilateRows(rows, h, ker) {
            var out = [], j, dy, src, q, e, list, runs;
            for (j = -ker.r; j < h + ker.r; j++) {
                list = [];
                for (dy = -ker.r; dy <= ker.r; dy++) {
                    e = ker.ex[dy + ker.r];
                    src = j - dy;
                    if (src < 0 || src >= h) continue;
                    runs = rows[src];
                    for (q = 0; q < runs.length; q += 2) list.push(runs[q] - e, runs[q + 1] + e);
                }
                out.push(mergeRuns(list));
            }
            return out;
        }

        // Prepara una forma con sus giros permitidos.
        var shapeCount = 0;
        function prepareShape(mask, ker, allowRotate) {
            var rots = [], k, m, rows, i, q, wide, wideRow, len, key, seen = {};
            for (k = 0; k < (allowRotate ? 4 : 1); k++) {
                m = rotateMask(mask, k);
                key = m.w + "x" + m.h + ":" + m.d.join("");
                if (seen[key]) continue; // giro idéntico (forma simétrica)
                seen[key] = true;
                rows = rowRuns(m);
                wide = 0; wideRow = 0;
                for (i = 0; i < rows.length; i++) {
                    for (q = 0; q < rows[i].length; q += 2) {
                        len = rows[i][q + 1] - rows[i][q] + 1;
                        if (len > wide) { wide = len; wideRow = i; }
                    }
                }
                rots.push({
                    k: k, w: m.w, h: m.h, rows: rows,
                    probe: dilateRows(rows, m.h, ker), probeOy: -ker.r,
                    wideRow: wideRow, wideLen: wide
                });
            }
            return { key: "s" + (shapeCount++), rots: rots, area: maskArea(mask), w: mask.w, h: mask.h };
        }

        // ---------------------------- Cuadrícula -------------------------
        function Grid(w, h) {
            this.w = w;
            this.h = h;
            this.rows = [];
            this.free = [];
        }

        // -1 si [a,b] está libre en la fila; si no, el fin del tramo que choca.
        Grid.prototype.hit = function (row, a, b) {
            var iv = this.rows[row];
            if (!iv) return -1;
            var lo = 0, hi = iv.length / 2, mid;
            while (lo < hi) {
                mid = (lo + hi) >> 1;
                if (iv[2 * mid + 1] < a) lo = mid + 1; else hi = mid;
            }
            if (lo < iv.length / 2 && iv[2 * lo] <= b) return iv[2 * lo + 1];
            return -1;
        };

        Grid.prototype.add = function (row, a, b) {
            var iv = this.rows[row] || [];
            iv.push(a, b);
            this.rows[row] = mergeRuns(iv);
            this.free[row] = undefined;
        };

        // Hueco libre más largo de la fila (dentro de la hoja).
        Grid.prototype.maxFree = function (row) {
            var f = this.free[row];
            if (f !== undefined) return f;
            var iv = this.rows[row], best = 0, pos = 0, i;
            if (!iv) best = this.w;
            else {
                for (i = 0; i < iv.length; i += 2) {
                    if (iv[i] - pos > best) best = iv[i] - pos;
                    pos = iv[i + 1] + 1;
                }
                if (this.w - pos > best) best = this.w - pos;
            }
            this.free[row] = best;
            return best;
        };

        // 0 si la forma cabe en (x, y); si no, cuánto avanzar en x.
        function fits(grid, rot, x, y) {
            var r, gy, runs, q, a, e, probe = rot.probe;
            for (r = 0; r < probe.length; r++) {
                gy = y + rot.probeOy + r;
                if (gy < 0 || gy >= grid.h) continue;
                runs = probe[r];
                for (q = 0; q < runs.length; q += 2) {
                    a = x + runs[q];
                    e = grid.hit(gy, a, x + runs[q + 1]);
                    if (e >= 0) return e + 1 - a;
                }
            }
            return 0;
        }

        // Posición más arriba (y luego más a la izquierda) donde cabe el giro.
        // Se detiene si ya no puede mejorar el borde inferior maxBottom.
        function findPos(grid, rot, startY, maxBottom) {
            var y, x, j, lim = grid.h - rot.h;
            for (y = startY; y <= lim; y++) {
                if (maxBottom !== null && y + rot.h >= maxBottom) return null;
                if (rot.wideLen && grid.maxFree(y + rot.wideRow) < rot.wideLen) continue;
                x = 0;
                while (x + rot.w <= grid.w) {
                    j = fits(grid, rot, x, y);
                    if (!j) return { x: x, y: y };
                    x += j;
                }
            }
            return null;
        }

        function place(grid, rot, x, y) {
            var j, q, runs;
            for (j = 0; j < rot.rows.length; j++) {
                runs = rot.rows[j];
                for (q = 0; q < runs.length; q += 2) grid.add(y + j, x + runs[q], x + runs[q + 1]);
            }
        }

        // --------------------------- Acomodo -----------------------------
        var ORDERS = {
            area: function (a, b) { return b.shape.area - a.shape.area; },
            maxSide: function (a, b) { return Math.max(b.shape.w, b.shape.h) - Math.max(a.shape.w, a.shape.h); },
            height: function (a, b) { return b.shape.h - a.shape.h; }
        };

        // Una pasada codiciosa. items: [{id, shape}]
        // Marca como ocupados rectángulos de celdas {x, y, w, h} (obstáculos
        // fijos). Devuelve la fila siguiente al obstáculo más bajo.
        function block(grid, list) {
            var bottom = 0, i, o, y, x1, x2;
            for (i = 0; list && i < list.length; i++) {
                o = list[i];
                x1 = Math.max(0, o.x);
                x2 = Math.min(grid.w - 1, o.x + o.w - 1);
                if (x2 < x1) continue;
                for (y = Math.max(0, o.y); y < Math.min(grid.h, o.y + o.h); y++) grid.add(y, x1, x2);
                if (o.y + o.h > bottom) bottom = Math.min(grid.h, o.y + o.h);
            }
            return bottom;
        }

        function greedy(items, gridW, gridH, order, onStep, obstacles) {
            var list = items.slice(0), grid = new Grid(gridW, gridH), i, r, rot, pos, best, bottom;
            var placed = [], unplaced = [], usedH = block(grid, obstacles), startKey, starts = {};
            var fn = ORDERS[order];
            list.sort(function (a, b) { return fn(a, b) || (a.id - b.id); });
            for (i = 0; i < list.length; i++) {
                best = null;
                for (r = 0; r < list[i].shape.rots.length; r++) {
                    rot = list[i].shape.rots[r];
                    // Las posiciones descartadas antes para esta forma y giro
                    // siguen ocupadas (la hoja solo se llena).
                    startKey = list[i].shape.key + "/" + rot.k;
                    pos = findPos(grid, rot, starts[startKey] || 0, best ? best.bottom : null);
                    if (pos) {
                        bottom = pos.y + rot.h;
                        if (!best || bottom < best.bottom) best = { rot: rot, x: pos.x, y: pos.y, bottom: bottom, key: startKey };
                    }
                }
                if (onStep) onStep(i + 1, list.length);
                if (!best) { unplaced.push(list[i].id); continue; }
                starts[best.key] = best.y;
                place(grid, best.rot, best.x, best.y);
                placed.push({ id: list[i].id, x: best.x, y: best.y, k: best.rot.k, w: best.rot.w, h: best.rot.h });
                if (best.bottom > usedH) usedH = best.bottom;
            }
            return { placed: placed, unplaced: unplaced, usedH: usedH };
        }

        function ordersFor(quality) {
            if (quality === "fast") return ["area"];
            if (quality === "best") return ["area", "maxSide", "height"];
            return ["area", "maxSide"];
        }

        // Una hoja: el mejor de varios órdenes (más piezas y luego menos alto).
        // opts: {gridW, gridH, quality, onProgress}
        function pack(items, opts) {
            var orders = ordersFor(opts.quality), best = null, res, o;
            for (o = 0; o < orders.length; o++) {
                res = greedy(items, opts.gridW, opts.gridH, orders[o], function (d, t) {
                    if (opts.onProgress) opts.onProgress(o * t + d, orders.length * t, "Acomodando por forma");
                }, opts.obstacles);
                if (!best || res.placed.length > best.placed.length ||
                    (res.placed.length === best.placed.length && res.usedH < best.usedH)) best = res;
            }
            return best;
        }

        // Varias hojas: llena una y pasa lo que sobra a la siguiente.
        function packSheets(items, opts) {
            var remaining = items.slice(0), sheets = [], res, left, i, k, n;
            var maxSheets = opts.maxSheets || 100;
            while (remaining.length && sheets.length < maxSheets) {
                n = sheets.length + 1;
                res = pack(remaining, {
                    gridW: opts.gridW, gridH: opts.gridH, quality: opts.quality,
                    obstacles: (opts.obstaclesEvery || []).concat(n === 1 ? (opts.obstacles || []) : []),
                    onProgress: function (d, t, m) { if (opts.onProgress) opts.onProgress(d, t, "Hoja " + n + ": " + m); }
                });
                if (!res.placed.length) break;
                sheets.push(res);
                left = {};
                for (i = 0; i < res.unplaced.length; i++) left[res.unplaced[i]] = true;
                k = [];
                for (i = 0; i < remaining.length; i++) if (left[remaining[i].id]) k.push(remaining[i]);
                remaining = k;
            }
            var ids = [];
            for (i = 0; i < remaining.length; i++) ids.push(remaining[i].id);
            return { sheets: sheets, unplaced: ids };
        }

        // Rellena los huecos de una hoja ya acomodada con copias de una forma.
        // opts: {gridW, gridH, obstacles, occupied: [{rows, x, y}], shape, max}
        // max = 0: sin límite. Devuelve [{x, y, k, w, h}].
        function fill(opts) {
            var grid = new Grid(opts.gridW, opts.gridH), out = [], starts = {}, i, j, q, o, r, rot, pos, best;
            block(grid, opts.obstacles);
            for (i = 0; i < opts.occupied.length; i++) {
                o = opts.occupied[i];
                for (j = 0; j < o.rows.length; j++) {
                    for (q = 0; q < o.rows[j].length; q += 2) grid.add(o.y + j, o.x + o.rows[j][q], o.x + o.rows[j][q + 1]);
                }
            }
            while (!opts.max || out.length < opts.max) {
                best = null;
                for (r = 0; r < opts.shape.rots.length; r++) {
                    rot = opts.shape.rots[r];
                    pos = findPos(grid, rot, starts[rot.k] || 0, best ? best.bottom : null);
                    if (pos && (!best || pos.y + rot.h < best.bottom)) best = { rot: rot, x: pos.x, y: pos.y, bottom: pos.y + rot.h };
                }
                if (!best) break;
                starts[best.rot.k] = best.y;
                place(grid, best.rot, best.x, best.y);
                out.push({ x: best.x, y: best.y, k: best.rot.k, w: best.rot.w, h: best.rot.h });
            }
            return out;
        }

        // Tramos de un rectángulo lleno de w x h celdas.
        function rectRows(w, h) {
            var rows = [], i;
            for (i = 0; i < h; i++) rows.push([0, w - 1]);
            return rows;
        }

        // Gira un vector (u, v) k veces 90° antihorario (Y hacia abajo).
        function rotVec(u, v, k) {
            var t;
            k = ((k % 4) + 4) % 4;
            while (k--) { t = u; u = v; v = 0 - t; }
            return [u, v];
        }

        return {
            inflate: inflate, decodePng: decodePng, emptyMask: emptyMask, fullMask: fullMask, maskFromImage: maskFromImage,
            maskFromAlpha: maskFromAlpha, maskArea: maskArea, blit: blit, rotateMask: rotateMask,
            rowRuns: rowRuns, mergeRuns: mergeRuns, kernel: kernel, dilateRows: dilateRows,
            prepareShape: prepareShape, Grid: Grid, pack: pack, packSheets: packSheets, rotVec: rotVec,
            fill: fill, rectRows: rectRows
        };
    })();
    // === NEST END ===

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

        // Celda de CSV con comillas si hace falta.
        function csvCell(v) {
            var t = String(v);
            return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
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
            qtyFromName: qtyFromName, pickLength: pickLength, cost: cost, safeFileName: safeFileName, csvCell: csvCell,
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
    var ORDER_LAYER = "Datos del pedido";
    var FILL_CELL_MM = 2; // cuadrícula del relleno de huecos (modo rectángulos)
    var SHEET_PREFIX = "Gangsheet - Hoja ";
    var SHEET_GAP = 56.69; // pt (2 cm) entre hojas
    var SHAPE_CELLS_MM = [1, 2, 3, 5]; // precisión del acomodo por forma
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
            labelPt: 7, labelOffset: 1.5 * UNITS.mm,
            fillMax: 0, orderLabel: false, orderText: "", csv: false, eps: false, epsOutline: true,
            multiSheet: false, maxLength: 300 * UNITS.cm, maxSheets: 20, showOnCanvas: true,
            method: 0, shapeCell: 1
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
            if (layer.locked || !layer.visible || layer.name === LABEL_LAYER || layer.name === ORDER_LAYER) return false;
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
            if (layer.locked || !layer.visible || layer.name === LABEL_LAYER || layer.name === ORDER_LAYER) return;
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
            st.nodes += 1;
            if (st.nodes > PREFLIGHT_MAX_NODES) { st.partial = true; return; }
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

    // ------------------------- Diálogo de tallas ------------------------
    // current: [{label, qty}]. Devuelve [{label, qty}] (qty > 0) o null si se cancela.
    function sizesDialog(title, current) {
        var d = new Window("dialog", "Tallas \u2014 " + title);
        d.alignChildren = "fill";
        d.add("statictext", undefined, "Copias por talla (vacío o 0 = ninguna):");
        var grid = d.add("panel");
        grid.orientation = "row";
        grid.alignChildren = "top";
        var cols = [grid.add("group"), grid.add("group")];
        cols[0].orientation = cols[1].orientation = "column";
        cols[0].alignChildren = cols[1].alignChildren = "right";

        var labels = [""].concat(SIZE_PRESETS.slice(1, SIZE_PRESETS.length - 1)), entries = [], i, j, g, st, e;
        for (i = 0; i < labels.length; i++) {
            g = cols[i < Math.ceil(labels.length / 2) ? 0 : 1].add("group");
            st = g.add("statictext", undefined, labels[i] || "Sin etiqueta");
            st.preferredSize.width = 80;
            e = g.add("edittext", undefined, "");
            e.characters = 5;
            entries.push({ label: labels[i], edit: e });
        }
        var pCustom = d.add("panel", undefined, "Personalizadas (texto libre)");
        pCustom.alignChildren = "left";
        var customs = [];
        for (i = 0; i < 3; i++) {
            g = pCustom.add("group");
            var el = g.add("edittext", undefined, "");
            el.characters = 12;
            g.add("statictext", undefined, "copias:");
            var eq = g.add("edittext", undefined, "");
            eq.characters = 5;
            customs.push({ labelEdit: el, edit: eq });
        }

        // Valores actuales
        var nextCustom = 0, found;
        for (i = 0; i < current.length; i++) {
            found = false;
            for (j = 0; j < entries.length; j++) {
                if (entries[j].label === current[i].label) { entries[j].edit.text = String(current[i].qty); found = true; }
            }
            if (!found && nextCustom < customs.length) {
                customs[nextCustom].labelEdit.text = current[i].label;
                customs[nextCustom].edit.text = String(current[i].qty);
                nextCustom++;
            }
        }

        var gb = d.add("group");
        gb.alignment = "right";
        gb.add("button", undefined, "Cancelar", { name: "cancel" });
        var ok = gb.add("button", undefined, "Aceptar", { name: "ok" });
        var result = null;

        function readQty(edit, what) {
            var t = Utils.trim(edit.text), q;
            if (!t) return 0;
            q = parseInt(t, 10);
            if (isNaN(q) || q < 0 || String(q) !== t) { alert("Cantidad no válida para " + what + ": \"" + t + "\""); return null; }
            return q;
        }

        ok.onClick = function () {
            var out = [], q, lab, k;
            for (k = 0; k < entries.length; k++) {
                q = readQty(entries[k].edit, entries[k].label || "Sin etiqueta");
                if (q === null) return;
                if (q > 0) out.push({ label: entries[k].label, qty: q });
            }
            for (k = 0; k < customs.length; k++) {
                lab = Utils.trim(customs[k].labelEdit.text);
                q = readQty(customs[k].edit, lab || "personalizada");
                if (q === null) return;
                if (q > 0 && !lab) { alert("Escribe el texto de la talla personalizada."); return; }
                if (q > 0) out.push({ label: lab, qty: q });
            }
            result = out;
            d.close(1);
        };
        return d.show() === 1 ? result : null;
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

        var pMulti = tArr.add("panel", undefined, "Varias hojas");
        pMulti.alignChildren = "left";
        var cbMulti = pMulti.add("checkbox", undefined, "Si no cabe todo, continuar en hojas nuevas (mesas de trabajo a la derecha)");
        cbMulti.value = cfg.multiSheet;
        var rowMaxLen = numRow(pMulti, "    Largo máximo por hoja (rollo):", round(cfg.maxLength / UNITS[unit], 2), 190);
        var gMaxSheets = pMulti.add("group");
        gMaxSheets.add("statictext", undefined, "    Máximo de hojas:").preferredSize.width = 190;
        var etMaxSheets = gMaxSheets.add("edittext", undefined, String(cfg.maxSheets));
        etMaxSheets.characters = 5;
        pMulti.add("statictext", undefined, "    En modo mesa de trabajo, cada hoja nueva tiene el tamaño de la actual.");

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
        var gM = pOpt.add("group");
        gM.add("statictext", undefined, "Método:").preferredSize.width = 70;
        var ddMethod = gM.add("dropdownlist", undefined, [
            "Rectángulos (rápido)",
            "Forma real: encaja siluetas (más lento)"
        ]);
        ddMethod.selection = cfg.method;
        var gCell = pOpt.add("group");
        gCell.add("statictext", undefined, "Precisión:").preferredSize.width = 70;
        var cellNames = [];
        for (u = 0; u < SHAPE_CELLS_MM.length; u++) cellNames.push(SHAPE_CELLS_MM[u] + " mm" + (u === 1 ? " (recomendada)" : u === 0 ? " (más lenta)" : ""));
        var ddCell = gCell.add("dropdownlist", undefined, cellNames);
        ddCell.selection = cfg.shapeCell;
        pOpt.add("statictext", undefined, "Forma real: con rotación prueba 0°, 90°, 180° y 270° para encajar las siluetas.");

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
        var cbShow = tQty.add("checkbox", undefined, "Mostrar en el lienzo la pieza seleccionada en la lista");
        cbShow.value = cfg.showOnCanvas !== false;

        var gQ1 = tQty.add("group");
        gQ1.add("statictext", undefined, "Copias:");
        var etQty = gQ1.add("edittext", undefined, "1");
        etQty.characters = 5;
        var btnQty = gQ1.add("button", undefined, "Asignar copias");
        var btnSizes = gQ1.add("button", undefined, "Tallas por diseño...");
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

        var pFill = tQty.add("panel", undefined, "Rellenar huecos (al final, sin alargar la hoja)");
        pFill.alignChildren = "left";
        var gFill = pFill.add("group");
        gFill.add("statictext", undefined, "Con copias de:");
        var ddFill = gFill.add("dropdownlist", undefined, ["(no rellenar)"]);
        ddFill.selection = 0;
        ddFill.preferredSize.width = 230;
        gFill.add("statictext", undefined, "hasta");
        var etFillMax = gFill.add("edittext", undefined, String(cfg.fillMax));
        etFillMax.characters = 4;
        gFill.add("statictext", undefined, "copias (0 = sin límite)");

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

        // Opciones de relleno: una por fila (diseño + talla).
        function fillChoices() {
            var rows = currentRows(), prev = ddFill.selection ? ddFill.selection.index : 0, i;
            ddFill.removeAll();
            ddFill.add("item", "(no rellenar)");
            for (i = 0; i < rows.length; i++) ddFill.add("item", rows[i].piece.name + (rows[i].label ? " \u00B7 " + rows[i].label : ""));
            ddFill.selection = prev < ddFill.items.length ? prev : 0;
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
            fillChoices();
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

        // Diseños (sin repetir) de las filas seleccionadas.
        function selectedPieces(idx) {
            var rows = currentRows(), out = [], i, j, dup;
            for (i = 0; i < idx.length; i++) {
                dup = false;
                for (j = 0; j < out.length; j++) if (out[j] === rows[idx[i]].piece) dup = true;
                if (!dup) out.push(rows[idx[i]].piece);
            }
            return out;
        }

        function containsPiece(list, piece) {
            for (var i = 0; i < list.length; i++) if (list[i] === piece) return true;
            return false;
        }

        // Varias tallas de uno o más diseños en un solo paso.
        btnSizes.onClick = function () {
            var idx = needSelection(), rows = currentRows(), designs, current = [], list, out = [], done = [], sel = [], i, j;
            if (!idx.length) return;
            designs = selectedPieces(idx);
            for (i = 0; i < rows.length; i++) {
                if (rows[i].piece === designs[0] && rows[i].qty > 0) current.push({ label: rows[i].label, qty: rows[i].qty });
            }
            // La fila por defecto (1 copia sin talla) no se precarga: si no, al
            // capturar tallas quedaría una copia extra sin etiqueta.
            if (current.length === 1 && !current[0].label && current[0].qty === 1) current = [];
            list = sizesDialog(designs.length === 1 ? designs[0].name : designs.length + " diseños", current);
            if (!list) return;
            for (i = 0; i < rows.length; i++) {
                if (!containsPiece(designs, rows[i].piece)) { out.push(rows[i]); continue; }
                if (containsPiece(done, rows[i].piece)) continue;
                done.push(rows[i].piece);
                if (!list.length) out.push({ piece: rows[i].piece, label: "", qty: 0 });
                for (j = 0; j < list.length; j++) out.push({ piece: rows[i].piece, label: list[j].label, qty: list[j].qty });
            }
            setCurrentRows(out);
            for (i = 0; i < out.length; i++) if (containsPiece(designs, out[i].piece)) sel.push(i);
            fillList(sel);
        };

        // Al seleccionar filas, se resalta la pieza en el documento.
        lb.onChange = function () {
            if (!cbShow.value || !info.highlight) return;
            var idx = selectedIndexes();
            if (idx.length) info.highlight(selectedPieces(idx));
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

        var pOrd = tOut.add("panel", undefined, "Pedido y archivos");
        pOrd.alignChildren = "left";
        var gOrd = pOrd.add("group");
        var cbOrder = gOrd.add("checkbox", undefined, "Etiqueta del pedido en cada hoja:");
        cbOrder.value = cfg.orderLabel;
        var etOrder = gOrd.add("edittext", undefined, cfg.orderText);
        etOrder.characters = 22;
        pOrd.add("statictext", undefined, "    Se agrega la fecha y \"Hoja n/N\"; su espacio se reserva en la esquina superior.");
        var cbCsv = pOrd.add("checkbox", undefined, "Guardar resumen de piezas por hoja y talla (.csv)");
        cbCsv.value = cfg.csv;
        var gEps = pOrd.add("group");
        var cbEps = gEps.add("checkbox", undefined, "Exportar EPS vectorial (uno por hoja)");
        cbEps.value = cfg.eps;
        var cbOutline = gEps.add("checkbox", undefined, "textos a contornos");
        cbOutline.value = cfg.epsOutline;
        pOrd.add("statictext", undefined, "    Los archivos se guardan en la carpeta del documento.");

        // ---- Sincronización ----
        function fixedLabel() {
            return "Mesa de trabajo actual (" + round(info.abW / UNITS[unit], 2) + " x " +
                round(info.abH / UNITS[unit], 2) + " " + unit + ")";
        }
        rbFixed.text = fixedLabel();

        function syncMode() {
            var strip = rbStrip.value;
            rowW.group.enabled = strip;
            rowMaxLen.group.enabled = strip && cbMulti.value;
            gMaxSheets.enabled = cbMulti.value;
            pLen.enabled = strip;
            gLen.enabled = gStd.enabled = cbResize.value;
            gStd.enabled = cbResize.value && ddLen.selection.index === 2;
            etPpi.enabled = cbExport.value;
            gCell.enabled = ddMethod.selection.index === 1;
            gPre.enabled = cbPre.value;
            etOrder.enabled = cbOrder.value;
            cbOutline.enabled = cbEps.value;
        }
        rbStrip.onClick = function () { rbFixed.value = false; syncMode(); };
        rbFixed.onClick = function () { rbStrip.value = false; syncMode(); };
        cbResize.onClick = cbExport.onClick = cbPre.onClick = cbMulti.onClick = cbOrder.onClick = cbEps.onClick = syncMode;
        ddLen.onChange = ddMethod.onChange = syncMode;
        if (cfg.mode === "fixed") rbFixed.value = true; else rbStrip.value = true;

        var convRows = [rowW.edit, rowGap.edit, rowMargin.edit, etMinLine, etLabelOff, rowMaxLen.edit];
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
            var maxLen = parseNum(rowMaxLen.edit.text), maxSheets = parseInt(etMaxSheets.text, 10);
            if (!rbSel.value && !rbAll.value) { alert("Elige qué elementos acomodar."); return; }
            for (i = 0; i < rows.length; i++) total += rows[i].qty;
            if (!total) { alert("Todas las piezas tienen 0 copias."); return; }
            if (labelPt === null || labelPt < 2 || labelPt > 200) { alert("El tamaño de letra de la etiqueta no es válido."); return; }
            if (labelOff === null || labelOff < 0) { alert("La separación de la etiqueta no es válida."); return; }
            if (rbStrip.value && (width === null || width <= 0)) { alert("El ancho de la hoja no es válido."); return; }
            if (cbMulti.value) {
                if (isNaN(maxSheets) || maxSheets < 1) { alert("El máximo de hojas no es válido."); return; }
                if (rbStrip.value && (maxLen === null || maxLen <= 0 || maxLen * k > MAX_CANVAS - 1)) {
                    alert("El largo máximo por hoja debe ser mayor que 0 y como máximo " + round((MAX_CANVAS - 1) / k, 1) + " " + unit + " (límite de Illustrator).");
                    return;
                }
            }
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
                multiSheet: cbMulti.value,
                maxLength: maxLen === null ? cfg.maxLength : maxLen * k,
                maxSheets: isNaN(maxSheets) ? cfg.maxSheets : maxSheets,
                showOnCanvas: cbShow.value,
                fillRow: ddFill.selection && ddFill.selection.index > 0 ? rows[ddFill.selection.index - 1] : null,
                fillMax: Math.max(0, parseInt(etFillMax.text, 10) || 0),
                orderLabel: cbOrder.value,
                orderText: Utils.trim(etOrder.text),
                csv: cbCsv.value,
                eps: cbEps.value,
                epsOutline: cbOutline.value,
                method: ddMethod.selection.index,
                shapeCell: ddCell.selection.index,
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

    // Carpeta y nombre base para los PNG (pregunta la carpeta si el documento
    // no se ha guardado).
    function exportBase() {
        var folder = null, name = "gangsheet";
        try {
            folder = doc.path && String(doc.path) !== "" ? Folder(doc.path) : null;
            name = doc.name.replace(/\.[^.]+$/, "");
        } catch (e) { }
        if (!folder || !folder.exists) {
            folder = Folder.selectDialog("¿Dónde guardar el PNG?");
            if (!folder) return null;
        }
        return { folder: folder, name: name };
    }

    // --------------------------- Forma real -----------------------------
    // Captura la silueta de cada diseño como una imagen pequeña con
    // transparencia, en un documento temporal, y la reduce a una máscara de
    // celdas cellPt. Prueba varios métodos porque Illustrator no siempre
    // dibuja igual las imágenes vinculadas:
    //   1) imageCapture con las imágenes de la copia incrustadas;
    //   2) exportar el documento temporal como PNG24 (Guardar para Web).
    // Si la imagen no tiene transparencia, se quita su fondo de color sólido.
    // Devuelve {fails: [{name, reason}], keyed: n} (keyed = fondos quitados).

    // Incrusta las imágenes vinculadas dentro de una copia (solo en el
    // documento temporal: el original no cambia).
    function embedLinked(item) {
        var i;
        try {
            if (item.typename === "PlacedItem") { item.embed(); return; }
            if (item.typename === "GroupItem") {
                for (i = item.pageItems.length - 1; i >= 0; i--) embedLinked(item.pageItems[i]);
            }
        } catch (e) { }
    }

    function readPng(file) {
        var data = null;
        file.encoding = "BINARY";
        if (file.open("r")) { data = file.read(); file.close(); }
        if (!data) throw new Error("la captura no generó imagen");
        return Nest.decodePng(data);
    }

    function captureMasks(list, cellPt, onProgress) {
        var tmp = null, fails = [], keyed = 0, i, piece, dup, bb, W, H, rect, res, why;
        var file = File(Folder.temp + "/autosort_forma.png");
        var ppi = 2 * 72 / cellPt; // 2 píxeles por celda

        // Método 1: captura directa.
        function byCapture() {
            var io = new ImageCaptureOptions();
            io.resolution = ppi;
            io.transparency = true;
            io.antiAliasing = true;
            if (file.exists) file.remove();
            tmp.imageCapture(file, rect, io);
            return readPng(file);
        }
        // Método 2: exportar PNG24 de la mesa de trabajo del documento temporal.
        function byExport() {
            var o = new ExportOptionsPNG24();
            o.transparency = true;
            o.antiAliasing = true;
            o.artBoardClipping = true;
            o.horizontalScale = Math.max(1, ppi / 72 * 100);
            o.verticalScale = o.horizontalScale;
            tmp.artboards[0].artboardRect = rect;
            if (file.exists) file.remove();
            tmp.exportFile(file, ExportType.PNG24, o);
            return readPng(file);
        }
        function attempt(fn) {
            var img = fn();
            var r = Nest.maskFromImage(img, W, H, 2);
            if (r.mode === "vacia") throw new Error("la captura salió vacía");
            return r;
        }

        try { tmp = app.documents.add(doc.documentColorSpace); } catch (e) { tmp = null; }
        for (i = 0; i < list.length; i++) {
            piece = list[i];
            W = Math.max(1, Math.ceil(piece.w / cellPt - 1e-6));
            H = Math.max(1, Math.ceil(piece.h / cellPt - 1e-6));
            piece.mask = null;
            dup = null;
            res = null;
            why = tmp ? "" : "no se pudo crear el documento temporal";
            if (tmp) {
                try {
                    dup = piece.item.duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
                    dup.hidden = false;
                    embedLinked(dup);
                    bb = getBounds(dup);
                    rect = [bb[0], bb[1], bb[0] + W * cellPt, bb[1] - H * cellPt];
                    try {
                        res = attempt(byCapture);
                    } catch (e1) {
                        why = e1.message;
                        try { res = attempt(byExport); } catch (e2) { why += " / " + e2.message; }
                    }
                } catch (e3) {
                    why = e3.message;
                }
                try { if (dup) dup.remove(); } catch (e4) { }
                try { if (file.exists) file.remove(); } catch (e5) { }
            }
            if (res) {
                piece.mask = res.mask;
                if (res.mode === "fondo") keyed += 1;
            } else {
                piece.mask = Nest.fullMask(W, H);
                fails.push({ name: piece.name, reason: why || "motivo desconocido" });
            }
            if (onProgress) onProgress(i + 1, list.length, "Leyendo la silueta de los diseños");
        }
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e6) { } }
        try { doc.activate(); } catch (e7) { }
        return { fails: fails, keyed: keyed };
    }

    // Forma "diseño + etiqueta debajo" como máscara, con los centros del
    // diseño y de la etiqueta medidos desde el centro de su rectángulo.
    function shapeGeometry(piece, label, cellPt, ker, allowRotate) {
        var dm = piece.mask, ls = label ? labelSize[label] : null;
        var Wl = 0, Hl = 0, off = 0, lx = 0;
        if (ls) {
            Wl = Math.max(1, Math.ceil(ls.w / cellPt - 1e-6));
            Hl = Math.max(1, Math.ceil(ls.h / cellPt - 1e-6));
            off = Math.ceil(opts.labelOffset / cellPt - 1e-6);
        }
        var Wc = Math.max(dm.w, Wl), Hc = dm.h + (ls ? off + Hl : 0);
        var m = Nest.emptyMask(Wc, Hc), dx = Math.floor((Wc - dm.w) / 2);
        Nest.blit(m, dm, dx, 0);
        if (ls) {
            lx = Math.floor((Wc - Wl) / 2);
            Nest.blit(m, Nest.fullMask(Wl, Hl), lx, dm.h + off);
        }
        var boxW = Wc * cellPt, boxH = Hc * cellPt;
        return {
            shape: Nest.prepareShape(m, ker, allowRotate),
            boxW: boxW, boxH: boxH,
            dOff: [dx * cellPt + piece.w / 2 - boxW / 2, piece.h / 2 - boxH / 2],
            lOff: ls ? [lx * cellPt + Wl * cellPt / 2 - boxW / 2, (dm.h + off) * cellPt + Hl * cellPt / 2 - boxH / 2] : null
        };
    }

    // Carpeta de salida: se pregunta una sola vez para PNG, CSV y EPS.
    var outBase = null;
    function getOutBase() {
        if (outBase === null) outBase = exportBase() || false;
        return outBase;
    }

    function writeText(file, text) {
        try {
            file.encoding = "UTF-8";
            if (!file.open("w")) return false;
            file.write("\uFEFF" + text); // BOM: Excel lo abre con acentos correctos
            file.close();
            return true;
        } catch (e) {
            return false;
        }
    }

    // EPS de una hoja: copia lo visible sobre la mesa de trabajo a un documento
    // temporal del tamaño de la hoja y lo guarda como EPS (el .ai no cambia).
    function exportEps(rect, file, outline) {
        var items = [], tmp = null, err = "", i, first = null, dup, rb, nb, dx, dy, o;
        function walk(layer) {
            if (!layer.visible) return;
            var k, it, b;
            for (k = 0; k < layer.pageItems.length; k++) {
                it = layer.pageItems[k];
                if (!isTopLevel(it) || it.hidden) continue;
                b = it.visibleBounds;
                if (b[0] < rect[2] && b[2] > rect[0] && b[3] < rect[1] && b[1] > rect[3]) items.push(it);
            }
            for (k = 0; k < layer.layers.length; k++) walk(layer.layers[k]);
        }
        for (i = 0; i < doc.layers.length; i++) walk(doc.layers[i]);
        if (!items.length) return { error: "la hoja está vacía" };
        try {
            tmp = app.documents.add(doc.documentColorSpace);
            rb = items[0].visibleBounds;
            for (i = 0; i < items.length; i++) {
                dup = items[i].duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
                try { dup.locked = false; } catch (e0) { }
                if (!first) first = dup;
            }
            // Las coordenadas pueden cambiar entre documentos: se corrige con la primera pieza.
            nb = first.visibleBounds;
            dx = nb[0] - rb[0];
            dy = nb[1] - rb[1];
            tmp.artboards[0].artboardRect = [rect[0] + dx, rect[1] + dy, rect[2] + dx, rect[3] + dy];
            if (outline) {
                for (i = tmp.textFrames.length - 1; i >= 0; i--) {
                    try { tmp.textFrames[i].createOutline(); } catch (e1) { }
                }
            }
            o = new EPSSaveOptions();
            o.embedAllFonts = true;
            o.embedLinkedFiles = true;
            o.includeDocumentThumbnails = false;
            o.saveMultipleArtboards = false;
            if (doc.documentColorSpace === DocumentColorSpace.CMYK) o.cmykPostScript = true;
            if (file.exists) file.remove();
            tmp.saveAs(file, o);
        } catch (e2) {
            err = e2.message;
        }
        if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e3) { } }
        try { doc.activate(); } catch (e4) { }
        return err ? { error: err } : (file.exists ? { file: file } : { error: "Illustrator no creó el archivo" });
    }

    // ------------------------------ Lienzo ------------------------------
    // Coloca la mesa de trabajo con el tamaño w x h lo más cerca posible de su
    // posición actual sin salirse del lienzo (se puede mover a la izquierda,
    // derecha, arriba o abajo). Devuelve { left, top } o null. Deja la mesa con
    // su rectángulo original.
    function fitOnCanvas(abObj, orig, w, h) {
        var l = orig[0], t = orig[1], r = orig[2], b = orig[3], res = null, cl, ct, lim;
        function trySet(rect) {
            try { abObj.artboardRect = rect; return true; } catch (e) { return false; }
        }
        // Mueve un borde de la mesa original hacia "far" hasta el límite del lienzo.
        function edge(side, far) {
            var ok = orig[side], bad = far, mid, n = 0, rect;
            while (Math.abs(bad - ok) > 0.5 && n < 50) {
                n += 1;
                mid = (ok + bad) / 2;
                rect = [l, t, r, b];
                rect[side] = mid;
                if (trySet(rect)) ok = mid; else bad = mid;
            }
            return ok;
        }
        if (trySet([l, t, l + w, t - h])) {
            res = { left: l, top: t };
        } else if (trySet(orig)) {
            lim = [Math.ceil(edge(0, r - 2 * MAX_CANVAS)), Math.floor(edge(1, b + 2 * MAX_CANVAS)),
                   Math.floor(edge(2, l + 2 * MAX_CANVAS)), Math.ceil(edge(3, t - 2 * MAX_CANVAS))];
            if (lim[2] - lim[0] >= w && lim[1] - lim[3] >= h) {
                cl = Math.max(lim[0], Math.min(l, lim[2] - w));
                ct = Math.min(lim[1], Math.max(t, lim[3] + h));
                if (trySet([cl, ct, cl + w, ct - h])) {
                    res = { left: cl, top: ct };
                } else {
                    // Último recurso: centrada en el lienzo.
                    cl = Math.round((lim[0] + lim[2] - w) / 2);
                    ct = Math.round((lim[1] + lim[3] + h) / 2);
                    if (trySet([cl, ct, cl + w, ct - h])) res = { left: cl, top: ct };
                }
            }
        }
        trySet(orig);
        return res;
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

    // Selección y vista originales, para restaurarlas si se cancela.
    var origSel = [], origView = null;
    try {
        var cs0 = doc.selection;
        if (cs0 && !cs0.typename) for (i = 0; i < cs0.length; i++) origSel.push(cs0[i]);
        origView = { center: doc.activeView.centerPoint, zoom: doc.activeView.zoom };
    } catch (e) { }

    // Resalta en el documento las piezas elegidas en la lista de cantidades.
    function highlightPieces(list) {
        try {
            var b = null, k;
            doc.selection = null;
            for (k = 0; k < list.length; k++) {
                list[k].item.selected = true;
                b = union(b, getBounds(list[k].item));
            }
            if (b) doc.activeView.centerPoint = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
            app.redraw();
        } catch (e) { }
    }

    function restoreSelection() {
        try {
            doc.selection = null;
            for (var k = 0; k < origSel.length; k++) origSel[k].selected = true;
            if (origView) {
                doc.activeView.zoom = origView.zoom;
                doc.activeView.centerPoint = origView.center;
            }
        } catch (e) { }
    }

    var opts = showDialog(cfg, { sel: selPieces, all: allPieces, abW: abW, abH: abH, highlight: highlightPieces });
    if (!opts) { restoreSelection(); return; }
    restoreSelection();
    var stdPt = opts.stdPt, rows = opts.rows, fillRow = opts.fillRow;
    delete opts.stdPt;
    delete opts.rows;
    delete opts.fillRow;
    saveConfig(opts);

    // Diseños a acomodar y total de copias por diseño (sumando sus tallas).
    var pieces = [], i, j;
    for (i = 0; i < rows.length; i++) {
        if (rows[i].qty <= 0 && rows[i] !== fillRow) continue;
        if (rows[i].piece.total === undefined) {
            rows[i].piece.total = 0;
            rows[i].piece.idx = pieces.length;
            pieces.push(rows[i].piece);
        }
        rows[i].piece.total += Math.max(0, rows[i].qty);
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
        try { if (orderLayer && !orderLayer.pageItems.length) orderLayer.remove(); } catch (e2) { }
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
        if ((rows[i].qty > 0 || rows[i] === fillRow) && rows[i].label && !labelSize[rows[i].label]) {
            var probe = makeLabel(rows[i].label), pb = probe.geometricBounds;
            labelSize[rows[i].label] = { w: pb[2] - pb[0], h: pb[1] - pb[3] };
            probe.remove();
            usesLabels = true;
        }
    }

    // ------------------------- Etiqueta del pedido ---------------------
    var orderLayer = null;
    function getOrderLayer(create) {
        if (orderLayer) return orderLayer;
        try { orderLayer = doc.layers.getByName(ORDER_LAYER); } catch (e) { orderLayer = null; }
        if (!orderLayer && create) {
            orderLayer = doc.layers.add();
            orderLayer.name = ORDER_LAYER;
        }
        if (orderLayer) {
            orderLayer.locked = false;
            orderLayer.visible = true;
        }
        return orderLayer;
    }

    function makeOrderLabel(text) {
        var tf = getOrderLayer(true).textFrames.add();
        tf.contents = text;
        var ca = tf.textRange.characterAttributes;
        ca.size = 8;
        if (labelFont) ca.textFont = labelFont;
        ca.fillColor = labelColor;
        try { tf.name = "Pedido"; } catch (e) { }
        return tf;
    }

    function two(n) { return (n < 10 ? "0" : "") + n; }
    var today = new Date();
    var orderPrefix = (opts.orderText ? opts.orderText + " \u00B7 " : "") +
        two(today.getDate()) + "/" + two(today.getMonth() + 1) + "/" + today.getFullYear() + " \u00B7 Hoja ";

    // Quita etiquetas y datos de pedido de una ejecución anterior sobre un rectángulo.
    function removeLabelsIn(r) {
        var lays = [getLabelLayer(false), getOrderLayer(false)], li, lay, k, lbb;
        for (li = 0; li < lays.length; li++) {
            lay = lays[li];
            if (!lay) continue;
            for (k = lay.pageItems.length - 1; k >= 0; k--) {
                lbb = lay.pageItems[k].visibleBounds;
                if (lbb[0] < r[2] && lbb[2] > r[0] && lbb[3] < r[1] && lbb[1] > r[3]) lay.pageItems[k].remove();
            }
        }
    }
    removeLabelsIn(ab);

    // Objetos fijos: lo bloqueado sobre la mesa de trabajo (o en capas
    // bloqueadas) se respeta como obstáculo. Coordenadas de la hoja.
    function collectObstacles(r) {
        var out = [];
        function locked(it) {
            if (it.locked) return true;
            var l = it.parent;
            while (l && l.typename === "Layer") { if (l.locked) return true; l = l.parent; }
            return false;
        }
        function walk(layer) {
            if (!layer.visible || layer.name === LABEL_LAYER || layer.name === ORDER_LAYER) return;
            var i, it, b;
            for (i = 0; i < layer.pageItems.length; i++) {
                it = layer.pageItems[i];
                if (!isTopLevel(it) || it.hidden || !locked(it)) continue;
                if (it.typename === "PathItem" && it.guides) continue;
                b = getBounds(it);
                if (!(b[0] < r[2] && b[2] > r[0] && b[3] < r[1] && b[1] > r[3])) continue;
                out.push({
                    x: Math.max(b[0], r[0]) - r[0], y: r[1] - Math.min(b[1], r[1]),
                    w: Math.min(b[2], r[2]) - Math.max(b[0], r[0]), h: Math.min(b[1], r[1]) - Math.max(b[3], r[3])
                });
            }
            for (i = 0; i < layer.layers.length; i++) walk(layer.layers[i]);
        }
        for (var i = 0; i < doc.layers.length; i++) walk(doc.layers[i]);
        return out;
    }
    var fixedObs = collectObstacles(ab), orderObs = [];
    if (opts.orderLabel) {
        // Se mide con el texto más largo posible para reservar su espacio.
        var oprobe = makeOrderLabel(orderPrefix + "99/99"), ob = oprobe.geometricBounds;
        orderObs.push({ x: opts.margin, y: opts.margin, w: ob[2] - ob[0], h: ob[1] - ob[3] });
        oprobe.remove();
    }

    // Obstáculos en celdas de la cuadrícula (acomodo por forma y relleno).
    function obsCells(list, c) {
        var out = [], i, o, x0, y0;
        for (i = 0; i < list.length; i++) {
            o = list[i];
            x0 = Math.floor((o.x - opts.margin) / c);
            y0 = Math.floor((o.y - opts.margin) / c);
            out.push({
                x: x0, y: y0,
                w: Math.ceil((o.x + o.w - opts.margin) / c - 1e-6) - x0,
                h: Math.ceil((o.y + o.h - opts.margin) / c - 1e-6) - y0
            });
        }
        return out;
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

    // Revisión rápida: en modo rollo de una sola hoja, si el área total ya
    // excede el lienzo de Illustrator no vale la pena calcular el acomodo.
    // (Por forma no aplica: las siluetas pueden encajar en menos área.)
    var shapeMode = opts.method === 1;
    if (opts.mode === "strip" && !opts.multiSheet && !shapeMode) {
        var binW0 = opts.width - 2 * opts.margin + opts.gap, area0 = 0;
        for (i = 0; i < packItems.length; i++) area0 += (packItems[i].w + opts.gap) * (packItems[i].h + opts.gap);
        if (binW0 > 0 && area0 / binW0 - opts.gap + 2 * opts.margin > MAX_CANVAS - 1) {
            alert("Las " + packItems.length + " piezas necesitan como mínimo " +
                round((area0 / binW0 - opts.gap + 2 * opts.margin) / UNITS[opts.unit], 1) + " " + opts.unit +
                " de largo, y Illustrator admite como máximo " + round(MAX_CANVAS / UNITS[opts.unit], 1) + " " + opts.unit +
                ".\n\nActiva \"Varias hojas\" (pestaña Acomodo) o reduce las copias. No se modificó nada.", SCRIPT_NAME);
            dropEmptyLabelLayer();
            return;
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
        onProgress: function (d, t, m) { progressWin.update(d, t, m); },
        obstacles: opts.multiSheet ? fixedObs : fixedObs.concat(orderObs),
        obstaclesEvery: orderObs
    };
    // sheets: [{placements, height}] — una entrada por hoja.
    var sheets = [], res, cellPt = SHAPE_CELLS_MM[opts.shapeCell] * UNITS.mm, shapeGeo = {}, shapeInfo = { fails: [], keyed: 0 };
    try {
        if (shapeMode) {
            shapeInfo = captureMasks(pieces, cellPt, packOpts.onProgress);
            var ker = Nest.kernel(opts.gap, cellPt), nestItems = [], key;
            for (i = 0; i < copies.length; i++) {
                key = copies[i].piece.idx + "|" + copies[i].label;
                if (!shapeGeo[key]) shapeGeo[key] = shapeGeometry(copies[i].piece, copies[i].label, cellPt, ker, packOpts.allowRotate);
                copies[i].key = key;
                nestItems.push({ id: i, shape: shapeGeo[key].shape });
            }
            var gridW = Math.floor((packOpts.width - 2 * opts.margin) / cellPt + 1e-6);
            var gridH = Math.floor(((opts.mode === "fixed" ? abH : opts.multiSheet ? opts.maxLength : MAX_CANVAS - 1) - 2 * opts.margin) / cellPt + 1e-6);
            var nestOpts = {
                gridW: gridW, gridH: gridH, quality: packOpts.quality, maxSheets: opts.maxSheets, onProgress: packOpts.onProgress,
                obstacles: obsCells(packOpts.obstacles, cellPt), obstaclesEvery: obsCells(orderObs, cellPt)
            };
            var nres = opts.multiSheet ? Nest.packSheets(nestItems, nestOpts) : { sheets: [Nest.pack(nestItems, nestOpts)] };
            res = { unplaced: nres.unplaced || nres.sheets[0].unplaced };
            for (i = 0; i < nres.sheets.length; i++) {
                if (!nres.sheets[i].placed.length) continue;
                sheets.push({
                    placements: nres.sheets[i].placed,
                    height: opts.mode === "fixed" ? abH : nres.sheets[i].usedH * cellPt + 2 * opts.margin
                });
            }
        } else if (opts.multiSheet) {
            packOpts.height = opts.mode === "strip" ? opts.maxLength : abH;
            packOpts.strip = opts.mode === "strip";
            packOpts.maxSheets = opts.maxSheets;
            res = Packer.packSheets(packItems, packOpts);
            sheets = res.sheets;
        } else {
            res = opts.mode === "strip" ? Packer.packStrip(packItems, packOpts) : Packer.packFixed(packItems, packOpts);
            if (res.placements.length) sheets = [{ placements: res.placements, height: res.height }];
        }
    } finally {
        progressWin.close();
    }

    // Tamaño final de cada hoja y ubicación, ANTES de mover nada. El lienzo de
    // Illustrator es un cuadrado fijo (~577 cm) y una mesa de trabajo no puede
    // salirse de él; si la hoja no cabe hacia abajo, se sube lo necesario.
    var u = opts.unit, kk = UNITS[u];
    var sheetW = packOpts.width, lengthNote = "", s, pick, maxH = 0;
    var sized = opts.mode === "strip" && (opts.resize || opts.multiSheet);
    for (s = 0; s < sheets.length; s++) {
        sheets[s].contentH = sheets[s].height;
        if (opts.mode === "fixed") {
            sheets[s].h = abH;
        } else if (sized) {
            pick = Utils.pickLength(sheets[s].height, opts.lengthMode, stdPt, kk);
            sheets[s].h = pick.length;
            if (opts.multiSheet && sheets[s].h > opts.maxLength) sheets[s].h = Math.max(opts.maxLength, sheets[s].height);
            sheets[s].standard = pick.standard && sheets[s].h === pick.length;
        } else {
            sheets[s].h = sheets[s].height;
        }
        if (sheets[s].h > maxH) maxH = sheets[s].h;
    }

    // ------------------------- Rellenar huecos --------------------------
    // Con la hoja ya medida, agrega copias del diseño elegido donde quepan
    // sin alargarla (incluye el espacio extra de un largo redondeado o estándar).
    var fillCount = 0;
    if (fillRow && sheets.length) {
        var fp = fillRow.piece, fl = fillRow.label, fKey = fp.idx + "|" + fl, fCell, fShape, fGridW;
        if (shapeMode) {
            fCell = cellPt;
            if (!shapeGeo[fKey]) shapeGeo[fKey] = shapeGeometry(fp, fl, cellPt, Nest.kernel(opts.gap, cellPt), packOpts.allowRotate);
            fShape = shapeGeo[fKey].shape;
        } else {
            fCell = FILL_CELL_MM * UNITS.mm;
            var fls = fl ? labelSize[fl] : null;
            var fsz = Utils.labeledSize(fp.w, fp.h, fls && fls.w, fls && fls.h, opts.labelOffset);
            fShape = Nest.prepareShape(Nest.fullMask(Math.ceil(fsz.w / fCell - 1e-6), Math.ceil(fsz.h / fCell - 1e-6)),
                Nest.kernel(opts.gap, fCell), packOpts.allowRotate);
        }
        fGridW = Math.floor((sheetW - 2 * opts.margin) / fCell + 1e-6);
        for (s = 0; s < sheets.length; s++) {
            if (opts.fillMax && fillCount >= opts.fillMax) break;
            var occ = [], pp, x0, y0, rr, extra;
            for (i = 0; i < sheets[s].placements.length; i++) {
                pp = sheets[s].placements[i];
                if (shapeMode) {
                    for (rr = 0; rr < shapeGeo[copies[pp.id].key].shape.rots.length; rr++) {
                        if (shapeGeo[copies[pp.id].key].shape.rots[rr].k === pp.k) {
                            occ.push({ rows: shapeGeo[copies[pp.id].key].shape.rots[rr].rows, x: pp.x, y: pp.y });
                        }
                    }
                } else {
                    x0 = Math.floor((pp.x - opts.margin) / fCell);
                    y0 = Math.floor((pp.y - opts.margin) / fCell);
                    occ.push({
                        rows: Nest.rectRows(Math.ceil((pp.x + pp.w - opts.margin) / fCell - 1e-6) - x0,
                            Math.ceil((pp.y + pp.h - opts.margin) / fCell - 1e-6) - y0),
                        x: x0, y: y0
                    });
                }
            }
            extra = Nest.fill({
                gridW: fGridW, gridH: Math.floor((sheets[s].h - 2 * opts.margin) / fCell + 1e-6),
                obstacles: obsCells((s === 0 ? fixedObs : []).concat(orderObs), fCell),
                occupied: occ, shape: fShape, max: opts.fillMax ? opts.fillMax - fillCount : 0
            });
            for (i = 0; i < extra.length; i++) {
                copies.push({ piece: fp, label: fl, key: fKey });
                sheets[s].placements.push(shapeMode ?
                    { id: copies.length - 1, x: extra[i].x, y: extra[i].y, k: extra[i].k, w: extra[i].w, h: extra[i].h } :
                    { id: copies.length - 1, x: opts.margin + extra[i].x * fCell, y: opts.margin + extra[i].y * fCell,
                      w: extra[i].w * fCell, h: extra[i].h * fCell, rotated: extra[i].k % 2 === 1 });
                fillCount += 1;
            }
        }
        fp.total += fillCount;
    }

    var originX = ab[0], originY = ab[1];
    if (sheets.length && opts.mode === "strip") {
        var sizeTxt = round(sheetW / kk, 1) + " x " + round(maxH / kk, 1) + " " + u;
        if (sheetW > MAX_CANVAS - 1 || maxH > MAX_CANVAS - 1) {
            alert("El acomodo necesita una hoja de " + sizeTxt + ", pero Illustrator admite como máximo " +
                round(MAX_CANVAS / kk, 1) + " " + u + " por lado.\n\nActiva \"Varias hojas\" (pestaña Acomodo) " +
                "o reduce las copias. No se modificó nada.", SCRIPT_NAME);
            dropEmptyLabelLayer();
            return;
        }
        var fit = fitOnCanvas(artboard, ab, sheetW, sized ? maxH : Math.max(maxH, abH));
        if (fit === null) {
            alert("No se pudo ubicar una hoja de " + sizeTxt + " dentro del lienzo de Illustrator.\n\n" +
                "Prueba en un documento nuevo o con la mesa de trabajo más cerca del centro del lienzo. " +
                "No se modificó nada.", SCRIPT_NAME);
            dropEmptyLabelLayer();
            return;
        }
        originX = fit.left;
        originY = fit.top;
        var moved = Math.abs(originX - ab[0]) > 0.5 || Math.abs(originY - ab[1]) > 0.5;
        if (fixedObs.length && moved) {
            alert("La hoja no cabe en el lienzo desde la posición actual y habría que mover la mesa de trabajo, " +
                "pero hay objetos fijos (bloqueados) sobre ella que no se pueden mover.\n\nAcerca la mesa de " +
                "trabajo y esos objetos al centro del lienzo, o usa \"Varias hojas\". No se modificó nada.", SCRIPT_NAME);
            dropEmptyLabelLayer();
            return;
        }
        if (moved) {
            lengthNote += "\n(La mesa de trabajo se movió para que la hoja quepa en el lienzo de Illustrator.)";
        }
    }

    // Hojas extra de una ejecución anterior: se eliminan (y sus etiquetas).
    if (opts.multiSheet) {
        for (i = doc.artboards.length - 1; i >= 0; i--) {
            if (i === abIndex || doc.artboards[i].name.indexOf(SHEET_PREFIX) !== 0) continue;
            removeLabelsIn(doc.artboards[i].artboardRect);
            doc.artboards.remove(i);
            if (i < abIndex) abIndex--;
        }
        artboard = doc.artboards[abIndex];
    }

    // Hoja 1: la mesa de trabajo activa.
    if (sheets.length) {
        sheets[0].x = originX;
        sheets[0].y = originY;
        sheets[0].abIndex = abIndex;
        if (sized) {
            artboard.artboardRect = [originX, originY, originX + sheetW, originY - sheets[0].h];
        } else if (opts.mode === "strip") {
            artboard.artboardRect = [originX, originY, originX + abW, originY - abH];
        }
    }

    // Hojas 2..N: mesas nuevas a la derecha; si no caben en el lienzo, en una
    // fila nueva debajo. Las hojas que no quepan se descartan.
    var rowLeft = originX, rowBottom = originY - (sheets.length ? sheets[0].h : abH), lastRight = originX + sheetW;
    var droppedSheets = 0, abRect;
    function tryAddArtboard(rect) {
        try { return doc.artboards.add(rect); } catch (e) { return null; }
    }
    for (s = 1; s < sheets.length; s++) {
        var nx = lastRight + SHEET_GAP, ny = sheets[s - 1].y, added;
        added = tryAddArtboard([nx, ny, nx + sheetW, ny - sheets[s].h]);
        if (!added) {
            nx = rowLeft;
            ny = rowBottom - SHEET_GAP;
            added = tryAddArtboard([nx, ny, nx + sheetW, ny - sheets[s].h]);
        }
        if (!added) {
            droppedSheets = sheets.length - s;
            sheets.length = s;
            break;
        }
        added.name = SHEET_PREFIX + (s + 1);
        sheets[s].x = nx;
        sheets[s].y = ny;
        sheets[s].abIndex = doc.artboards.length - 1;
        lastRight = nx + sheetW;
        if (ny - sheets[s].h < rowBottom) rowBottom = ny - sheets[s].h;
    }

    // Crear las copias necesarias ANTES de girar/mover el original.
    var placedCount = [], placedTotal = 0;
    for (i = 0; i < pieces.length; i++) placedCount.push(0);
    for (s = 0; s < sheets.length; s++) {
        for (i = 0; i < sheets[s].placements.length; i++) placedCount[copies[sheets[s].placements[i].id].piece.idx] += 1;
        placedTotal += sheets[s].placements.length;
    }
    for (i = 0; i < pieces.length; i++) {
        pieces[i].instances = [pieces[i].item];
        for (j = 1; j < placedCount[i]; j++) pieces[i].instances.push(pieces[i].item.duplicate());
    }

    // Aplicar posiciones
    var angle = opts.rotation === 2 ? 90 : -90; // Illustrator: positivo = antihorario
    var dir = opts.rotation === 2 ? "ccw" : "cw";

    // Centra un objeto dentro de un hueco (coordenadas de pantalla relativas a la hoja).
    // Ubica el centro de un objeto en (cx, cy) de la hoja (pantalla, Y abajo).
    function placeAt(obj, cx, cy, ox, oy) {
        var b = getBounds(obj);
        obj.translate(ox + cx - (b[0] + b[2]) / 2, oy - cy - (b[1] + b[3]) / 2);
    }

    function placeCentered(obj, r, ox, oy) {
        var b = getBounds(obj), bw = b[2] - b[0], bh = b[1] - b[3];
        obj.translate(ox + r.x + (r.w - bw) / 2 - b[0], oy - r.y - (r.h - bh) / 2 - b[1]);
    }

    var p, cp, piece, item, slots, tf, sizeCount = {}, sizeOrder = [];
    for (s = 0; s < sheets.length; s++) {
        sheets[s].usedArea = 0;
        for (i = 0; i < sheets[s].placements.length; i++) {
            p = sheets[s].placements[i];
            cp = copies[p.id];
            piece = cp.piece;
            ls = cp.label ? labelSize[cp.label] : null;
            item = piece.instances.shift();
            if (shapeMode) {
                // Forma real: el rectángulo de la máscara girado k veces; el
                // diseño y la etiqueta se ubican por su centro dentro de él.
                var geo = shapeGeo[cp.key], kq = p.k;
                var bw = (kq % 2 ? geo.boxH : geo.boxW), bh = (kq % 2 ? geo.boxW : geo.boxH);
                var bcx = opts.margin + p.x * cellPt + bw / 2, bcy = opts.margin + p.y * cellPt + bh / 2;
                var dv = Nest.rotVec(geo.dOff[0], geo.dOff[1], kq);
                if (kq) item.rotate(90 * kq, true, true, true, true, Transformation.CENTER);
                placeAt(item, bcx + dv[0], bcy + dv[1], sheets[s].x, sheets[s].y);
                try { item.note = Utils.noteWithLabel(item.note, cp.label); } catch (e) { }
                if (geo.lOff) {
                    var lv = Nest.rotVec(geo.lOff[0], geo.lOff[1], kq);
                    tf = makeLabel(cp.label);
                    if (kq) tf.rotate(90 * kq, true, true, true, true, Transformation.CENTER);
                    placeAt(tf, bcx + lv[0], bcy + lv[1], sheets[s].x, sheets[s].y);
                    if (!sizeCount[cp.label]) { sizeCount[cp.label] = 0; sizeOrder.push(cp.label); }
                    sizeCount[cp.label] += 1;
                }
                // Área real de la silueta (no de su rectángulo, que se traslapa).
                sheets[s].usedArea += Nest.maskArea(piece.mask) * cellPt * cellPt;
                continue;
            }
            slots = Utils.labelSlots(p, piece.w, piece.h, ls && ls.w, ls && ls.h, opts.labelOffset, dir);
            if (p.rotated) item.rotate(angle, true, true, true, true, Transformation.CENTER);
            placeCentered(item, slots.design, sheets[s].x, sheets[s].y);
            // La talla queda en la nota del objeto para conservarla si se vuelve a acomodar.
            try { item.note = Utils.noteWithLabel(item.note, cp.label); } catch (e) { }
            if (slots.label) {
                tf = makeLabel(cp.label);
                if (p.rotated) tf.rotate(angle, true, true, true, true, Transformation.CENTER);
                placeCentered(tf, slots.label, sheets[s].x, sheets[s].y);
                if (!sizeCount[cp.label]) { sizeCount[cp.label] = 0; sizeOrder.push(cp.label); }
                sizeCount[cp.label] += 1;
            }
            sheets[s].usedArea += piece.w * piece.h;
        }
    }

    // Etiqueta del pedido en la esquina superior izquierda de cada hoja.
    if (opts.orderLabel) {
        for (s = 0; s < sheets.length; s++) {
            var otf = makeOrderLabel(orderPrefix + (s + 1) + "/" + sheets.length), obb = getBounds(otf);
            otf.translate(sheets[s].x + opts.margin - obb[0], sheets[s].y - opts.margin - obb[1]);
        }
    }

    // Diseños sin ninguna copia acomodada: el original se aparta a la derecha.
    var leftovers = [], missingCopies = 0;
    for (i = 0; i < pieces.length; i++) {
        missingCopies += pieces[i].total - placedCount[i];
        if (!placedCount[i] && pieces[i].total > 0) leftovers.push(pieces[i]);
    }
    if (leftovers.length) {
        var colX = Math.max(originX + abW, lastRight) + 36, curY = originY, colW = 0, nb;
        for (i = 0; i < leftovers.length; i++) {
            piece = leftovers[i];
            nb = getBounds(piece.item);
            if (curY - piece.h < originY - Math.max(abH, 2000) && curY !== originY) {
                colX += colW + 36; curY = originY; colW = 0;
            }
            try { piece.item.translate(colX - nb[0], curY - nb[1]); } catch (e) { }
            curY -= piece.h + 36;
            if (piece.w > colW) colW = piece.w;
        }
    }
    if (orderLayer) {
        orderLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
        if (!orderLayer.pageItems.length) orderLayer.remove();
    }
    if (labelLayer) {
        labelLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
        if (!labelLayer.pageItems.length && !usesLabels) labelLayer.remove();
    }
    doc.artboards.setActiveArtboardIndex(abIndex);

    // Selección final: los diseños que no cupieron, para localizarlos fácil.
    doc.selection = null;
    for (i = 0; i < leftovers.length; i++) leftovers[i].item.selected = true;

    // ------------------------------ Resumen -----------------------------
    var totalLen = 0, totalArea = 0, totalUsed = 0, line, msg;
    msg = "Piezas acomodadas: " + placedTotal + " de " + packItems.length + " (" + pieces.length + " diseño(s))";
    if (!sheets.length) msg += "\nNinguna pieza cupo en la hoja.";
    for (s = 0; s < sheets.length; s++) {
        var shW = opts.mode === "strip" || sized ? sheetW : abW;
        totalLen += sheets[s].h;
        totalArea += shW * sheets[s].h;
        totalUsed += sheets[s].usedArea;
        line = (sheets.length > 1 ? "Hoja " + (s + 1) + ": " : "Hoja: ") +
            round(shW / kk, 2) + " x " + round(sheets[s].h / kk, 2) + " " + u +
            " — " + sheets[s].placements.length + " pieza(s), " +
            round(sheets[s].usedArea / (shW * sheets[s].h) * 100, 1) + " %";
        if (sheets[s].standard) line += " (tamaño estándar)";
        msg += "\n" + line;
    }
    msg += lengthNote;
    if (sheets.length > 1) msg += "\nAprovechamiento total: " + round(totalUsed / totalArea * 100, 1) + " %";
    if (opts.price > 0 && sheets.length) {
        var c = Utils.cost(totalLen, opts.price, PRICE_UNITS[opts.priceUnit]);
        msg += "\nCosto estimado: " + opts.currency + round(c, 2).toFixed(2) +
            " (" + round(totalLen / kk, 1) + " " + u + " de largo, " + opts.currency + opts.price + " por " + opts.priceUnit + ")";
    }
    if (sizeOrder.length) {
        var parts = [];
        for (i = 0; i < sizeOrder.length; i++) parts.push(sizeOrder[i] + " ×" + sizeCount[sizeOrder[i]]);
        msg += "\nTallas: " + parts.join(", ");
    }
    if (shapeMode) {
        msg += "\nMétodo: forma real (precisión " + SHAPE_CELLS_MM[opts.shapeCell] + " mm)";
        if (shapeInfo.keyed) msg += "\n" + shapeInfo.keyed + " diseño(s) sin transparencia: se quitó su fondo de color sólido.";
        if (shapeInfo.fails.length) {
            msg += "\n" + shapeInfo.fails.length + " diseño(s) sin silueta legible: se usó su rectángulo.";
            for (i = 0; i < Math.min(3, shapeInfo.fails.length); i++) {
                msg += "\n   \u2022 " + shapeInfo.fails[i].name + ": " + shapeInfo.fails[i].reason;
            }
        }
    }
    if (fillCount) msg += "\nRelleno: " + fillCount + " copia(s) extra de " + fillRow.piece.name + (fillRow.label ? " \u00B7 " + fillRow.label : "") + ".";
    if (fillRow && !fillCount) msg += "\nRelleno: no quedó espacio para copias extra.";
    if (fixedObs.length) msg += "\nObjetos fijos respetados: " + fixedObs.length + ".";
    msg += preflightNote;
    if (droppedSheets) {
        msg += "\n\nNo cupieron " + droppedSheets + " hoja(s) más en el lienzo de Illustrator; " +
            "sus piezas no se acomodaron. Reduce el largo máximo o acomoda el resto en otro documento.";
    }
    if (missingCopies) {
        msg += "\n\nNo se acomodaron " + missingCopies + " pieza(s).";
        if (opts.multiSheet && res.unplaced.length && !droppedSheets && sheets.length >= opts.maxSheets) {
            msg += " Se alcanzó el máximo de " + opts.maxSheets + " hojas.";
        }
        if (leftovers.length) msg += " Los diseños sin ninguna copia acomodada quedaron seleccionados a la derecha.";
        if (missingCopies > leftovers.length) msg += " Las copias extra que no cupieron no se crearon.";
    }

    // Exportar PNG (uno por hoja)
    if (opts.exportPng && sheets.length) {
        var base = getOutBase();
        if (base) {
            var exported = [], failed = [];
            for (s = 0; s < sheets.length; s++) {
                var shW2 = opts.mode === "strip" || sized ? sheetW : abW;
                var fname = base.name + (sheets.length > 1 ? "_hoja" + (s + 1) : "") + "_" +
                    round(shW2 / kk, 1) + "x" + round(sheets[s].h / kk, 1) + u;
                var exp = exportPng(sheets[s].abIndex, File(base.folder.fsName + "/" + Utils.safeFileName(fname) + ".png"), opts.ppi);
                if (exp.file) exported.push(decodeURI(exp.file.name) + " (" + Math.round(shW2 / 72 * opts.ppi) + " x " +
                    Math.round(sheets[s].h / 72 * opts.ppi) + " px)");
                else failed.push("Hoja " + (s + 1) + ": " + exp.error);
            }
            if (exported.length) {
                msg += "\n\nPNG exportado(s) en " + decodeURI(base.folder.fsName) + ":\n" + exported.join("\n");
                if (usesLabels) msg += "\nIncluyen las etiquetas de talla (capa \"" + LABEL_LAYER + "\").";
            }
            if (failed.length) msg += "\n\nNo se pudo exportar:\n" + failed.join("\n");
        }
    }

    // Resumen de piezas (.csv)
    var shW3 = opts.mode === "strip" || sized ? sheetW : abW;
    if (opts.csv && sheets.length && getOutBase()) {
        var csvRows = ["Hoja,Diseño,Talla,Copias,Ancho (" + u + "),Largo (" + u + ")"], tally, order2, key2, cp2;
        for (s = 0; s < sheets.length; s++) {
            tally = {}; order2 = [];
            for (i = 0; i < sheets[s].placements.length; i++) {
                cp2 = copies[sheets[s].placements[i].id];
                key2 = cp2.piece.name + "\u0000" + (cp2.label || "");
                if (!tally[key2]) { tally[key2] = { name: cp2.piece.name, label: cp2.label || "", n: 0 }; order2.push(key2); }
                tally[key2].n += 1;
            }
            for (i = 0; i < order2.length; i++) {
                csvRows.push([s + 1, Utils.csvCell(tally[order2[i]].name), Utils.csvCell(tally[order2[i]].label),
                    tally[order2[i]].n, round(shW3 / kk, 2), round(sheets[s].h / kk, 2)].join(","));
            }
        }
        var csvFile = File(outBase.folder.fsName + "/" + Utils.safeFileName(outBase.name + "_resumen") + ".csv");
        msg += writeText(csvFile, csvRows.join("\r\n")) ?
            "\n\nResumen guardado: " + decodeURI(csvFile.name) : "\n\nNo se pudo guardar el resumen .csv.";
    }

    // EPS vectorial (uno por hoja)
    if (opts.eps && sheets.length && getOutBase()) {
        var epsOk = [], epsBad = [];
        for (s = 0; s < sheets.length; s++) {
            var en = outBase.name + (sheets.length > 1 ? "_hoja" + (s + 1) : "") + "_" +
                round(shW3 / kk, 1) + "x" + round(sheets[s].h / kk, 1) + u;
            var er = exportEps(doc.artboards[sheets[s].abIndex].artboardRect,
                File(outBase.folder.fsName + "/" + Utils.safeFileName(en) + ".eps"), opts.epsOutline);
            if (er.file) epsOk.push(decodeURI(er.file.name)); else epsBad.push("Hoja " + (s + 1) + ": " + er.error);
        }
        if (epsOk.length) msg += "\n\nEPS vectorial guardado(s):\n" + epsOk.join("\n");
        if (epsBad.length) msg += "\n\nNo se pudo exportar el EPS:\n" + epsBad.join("\n");
    }

    alert(msg, SCRIPT_NAME);
})();
