// La copia descargable de la web debe ser idéntica al script.
// Uso: node test/docs-sync.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const a = fs.readFileSync(path.join(__dirname, "..", "AutoSort-Gangsheet.jsx"));
const b = fs.readFileSync(path.join(__dirname, "..", "docs", "download", "AutoSort-Gangsheet.jsx"));
if (!a.equals(b)) {
  console.error("docs/download/AutoSort-Gangsheet.jsx no coincide con el script. Ejecuta: npm run sync-docs");
  process.exit(1);
}
console.log("ok - la descarga del sitio coincide con el script");
