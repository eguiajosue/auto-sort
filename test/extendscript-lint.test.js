// Revisa construcciones que el motor ExtendScript de Illustrator interpreta
// mal aunque sean JavaScript válido (ver el error "Cannot assign value" con
// "!d.bitcount--"). Uso: node test/extendscript-lint.test.js
"use strict";
const fs = require("fs");
const path = require("path");

const lines = fs.readFileSync(path.join(__dirname, "..", "AutoSort-Gangsheet.jsx"), "utf8").split("\n");
const problems = [];
lines.forEach((line, i) => {
  const code = line.replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  // ++/-- sobre una propiedad o elemento (x.y++, a[i]--, ++x.y)
  if (/\.[A-Za-z_$][\w$]*\s*(\+\+|--)|\]\s*(\+\+|--)|(\+\+|--)\s*[A-Za-z_$][\w$]*\s*[.[]/.test(code)) {
    problems.push(`${i + 1}: ++/-- sobre una propiedad: ${line.trim()}`);
  }
  // objeto literal indexado directamente: { ... }[x]
  if (/\}\s*\[/.test(code) && /\{[^}]*:[^}]*\}\s*\[/.test(code)) {
    problems.push(`${i + 1}: objeto literal indexado: ${line.trim()}`);
  }
  // palabras reservadas de ES3 como propiedad
  if (/\.(abstract|boolean|byte|char|class|const|debugger|double|enum|export|extends|final|float|goto|implements|import|int|interface|long|native|package|private|protected|public|short|static|super|synchronized|throws|transient|volatile|in|default|delete|new)\b/.test(code)) {
    problems.push(`${i + 1}: palabra reservada como propiedad: ${line.trim()}`);
  }
});
if (problems.length) {
  console.error("Construcciones problemáticas para ExtendScript:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("ok - sin construcciones problemáticas para ExtendScript");
