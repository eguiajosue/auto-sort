<div align="center">

# AutoSort Gangsheet DTF

**Script gratuito y de código abierto para Adobe Illustrator que arma gangsheets DTF sin desperdiciar película.**

Acomoda tus diseños con el menor largo posible, deja la separación justa para recortar,
etiqueta las tallas y exporta el PNG listo para el RIP.

[**Descargar la última versión**](https://github.com/eguiajosue/auto-sort/releases/latest) ·
[**Sitio web y guía**](https://eguiajosue.github.io/auto-sort/) ·
[Reportar un problema](https://github.com/eguiajosue/auto-sort/issues)

![Illustrator](https://img.shields.io/badge/Adobe%20Illustrator-CC%202018%2B-FF9A00?logo=adobeillustrator&logoColor=white)
![Plataformas](https://img.shields.io/badge/Windows%20%7C%20macOS-supported-444)
![Formato](https://img.shields.io/badge/formato-.jsx%20(ExtendScript)-blue)
[![Release](https://img.shields.io/github/v/release/eguiajosue/auto-sort?label=versi%C3%B3n)](https://github.com/eguiajosue/auto-sort/releases/latest)

</div>

---

## Contenido

- [Por qué AutoSort](#por-qué-autosort)
- [Funciones](#funciones)
- [Instalación](#instalación)
- [Cómo se usa](#cómo-se-usa)
- [Opciones](#opciones)
- [Método: rectángulos vs. forma real](#método-rectángulos-vs-forma-real)
- [Límites y notas](#límites-y-notas)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Desarrollo](#desarrollo)
- [Licencia](#licencia)

## Por qué AutoSort

Armar un gangsheet a mano es lento y desperdicia película. AutoSort hace tres cosas:

1. **Nunca modifica el tamaño** de tus diseños: solo cambia su posición y los gira (0°, 90°, 180°, 270°).
2. **Respeta la separación de corte** entre piezas, para poder recortarlas.
3. **Minimiza el largo de la hoja** (o llena la mesa de trabajo que ya tienes).

## Funciones

| | |
|---|---|
| **Grupos como una sola pieza** | Incluidos los grupos con máscara de recorte: se mide la forma de la máscara, no el arte oculto. |
| **Rollo o mesa de trabajo** | Ancho fijo con largo automático (rollo DTF), o dentro del artboard actual. |
| **Forma real (nesting)** | Encaja siluetas: una copia girada 180° entra en el hueco de otra. |
| **Cantidades y tallas** | Copias por diseño y varias tallas a la vez (XS–4XL o personalizada), con etiqueta discreta. |
| **Varias hojas** | Lo que no cabe continúa en mesas de trabajo nuevas. |
| **Revisión previa** | Baja resolución, vínculos rotos, líneas muy finas y textos sin convertir a contornos. |
| **Largo y costo** | Largo exacto, redondeado o tamaño estándar; costo estimado por cm, m, in o ft. |
| **PNG para el RIP** | PNG transparente a la resolución que elijas, uno por hoja. |

## Instalación

1. Descarga `AutoSort-Gangsheet.jsx` desde la [**última versión (Releases)**](https://github.com/eguiajosue/auto-sort/releases/latest). Ahí también está el zip con el README y la licencia, y las versiones anteriores. (También puedes bajarlo desde [la web](https://eguiajosue.github.io/auto-sort/download/AutoSort-Gangsheet.jsx).)
2. **Cierra Illustrator** y copia el archivo a la carpeta de scripts:
   - **Windows:** `C:\Program Files\Adobe\Adobe Illustrator <versión>\Presets\<idioma>\Scripts\`
   - **macOS:** `/Applications/Adobe Illustrator <versión>/Presets.localized/<idioma>/Scripts/`
3. Abre Illustrator y ve a **Archivo → Secuencias de comandos → AutoSort-Gangsheet**.

> **Sin instalar:** Archivo → Secuencias de comandos → *Otra secuencia de comandos…* y elige el archivo.
>
> **Al actualizar:** reemplaza el archivo y **reinicia Illustrator**; a veces sigue usando la copia que cargó al abrir.

## Cómo se usa

1. Ten cada diseño como objeto o grupo en el documento. Selecciona los que quieras acomodar (o ninguno, para usar todo lo visible y desbloqueado).
2. Ejecuta el script. En **Acomodo** elige rollo o mesa de trabajo, la separación y el método.
3. En **Cantidades** asigna copias y tallas. Al elegir una fila, la pieza se resalta en el lienzo.
4. Pulsa **Acomodar**. El resumen indica el tamaño de cada hoja, el aprovechamiento y el costo estimado.

### Tallas y etiquetas

Cada copia lleva una etiqueta pequeña con su talla, en la capa **`Etiquetas de talla`**. La talla también se guarda en la nota del objeto, así que al volver a ejecutar el script cada copia la conserva. Un nombre que termina en `x10` (por ejemplo `Logo x10`) toma 10 copias automáticamente.

> La etiqueta **se imprime en la película**. Queda separada del diseño para recortarla, o puedes ocultar la capa antes de imprimir o exportar.

### Varias hojas

Con **Varias hojas** activado, lo que no cabe continúa en mesas de trabajo `Gangsheet - Hoja 2, 3…` a la derecha. En modo rollo eliges el largo máximo por hoja y la última se acorta a lo que ocupa. Al volver a ejecutar el script, esas hojas se reemplazan.

## Opciones

<details open>
<summary><b>Acomodo</b></summary>

| Opción | Descripción |
| --- | --- |
| Elementos | Selección actual, o todo lo visible y desbloqueado. |
| Lienzo | Rollo (ancho fijo, largo automático) o mesa de trabajo actual. |
| Entre elementos / Margen | Espacio mínimo entre piezas y hasta el borde (3 mm por defecto). |
| Rotación | No rotar, o girar en sentido horario o antihorario. |
| Calidad | Rápida, Normal o Máxima (más combinaciones, más lenta). |
| Método | Rectángulos (rápido) o Forma real (encaja siluetas). |
| Precisión | Solo forma real: cuadrícula de 1, 2, 3 o 5 mm. |
| Varias hojas | Continúa en hojas nuevas; largo máximo por hoja y máximo de hojas. |

</details>

<details>
<summary><b>Cantidades</b></summary>

| Botón | Qué hace |
| --- | --- |
| Asignar copias | Cambia cuántas copias se acomodan (0 = no acomodar). |
| Tallas por diseño… | XS, S, M, L, XL, 2XL, 3XL, 4XL, sin etiqueta y 3 personalizadas, para uno o varios diseños. |
| Asignar talla / Agregar talla | Pone una talla a las filas, o crea otra fila del mismo diseño. |
| Quitar fila / Reiniciar lista | Quita filas o vuelve al estado inicial. |
| Mostrar en el lienzo | Selecciona y centra la pieza elegida. |

</details>

<details>
<summary><b>Salida</b></summary>

| Opción | Descripción |
| --- | --- |
| Ajustar la mesa de trabajo | En modo rollo, cambia el largo del artboard al resultado. |
| Largo | Exacto, redondeado a unidad entera, o tamaño estándar (lista editable). |
| Costo estimado | Precio por cm, m, in o ft de largo (0 = no calcular). |
| Exportar PNG | PNG transparente a N ppi (300 por defecto), uno por hoja, en la carpeta del documento. |
| Revisión previa | Resolución mínima (ppi) y grosor mínimo de línea. |

</details>

## Método: rectángulos vs. forma real

- **Rectángulos:** cada pieza ocupa su rectángulo envolvente. Es rápido. Aquí 180° ocupa lo mismo que 0°, así que solo gira 90° cuando ahorra espacio.
- **Forma real:** captura la silueta de cada diseño (en un documento temporal que se cierra solo), la convierte en una cuadrícula y coloca cada copia lo más arriba posible probando 0°, 90°, 180° y 270°. Una celda cuenta como ocupada si *cualquier* parte del diseño la toca, así que la silueta nunca es más chica que el arte y la separación real es igual o mayor a la indicada. Si no puede leer la silueta de un diseño, usa su rectángulo y lo avisa.

En pruebas con una silueta de flecha de 10 × 25 cm, 20 copias en un rollo de 58 cm pasaron de **102.7 cm a 52.2 cm** de largo. El ahorro real depende de la forma de tus diseños, y con precisión de 1 mm el cálculo es notablemente más lento.

## Límites y notas

- El lienzo de Illustrator mide ~577 × 577 cm y ninguna mesa de trabajo puede salirse de él. Si la hoja no cabe hacia abajo, el script sube la mesa de trabajo; si es más larga que el lienzo, avisa (sin modificar nada) y sugiere **Varias hojas**.
- Se usan los **límites visibles** (incluyen el grosor del trazo).
- Se ignoran objetos bloqueados, ocultos o en capas bloqueadas/ocultas. En modo *Selección*, el resto del documento no se toma en cuenta.
- Exportar PNG usa *Exportar para pantallas* (CC 2018+) y, en versiones anteriores, *imageCapture*. Hojas muy largas a 300 ppi generan imágenes enormes (58 × 500 cm ≈ 6850 × 59000 px) y pueden fallar por memoria.

## Preguntas frecuentes

<details>
<summary><b>¿Por qué es para Illustrator y no para Photoshop?</b></summary>

Porque en el departamento donde trabajo se trabaja sobre todo con vectores: logos, textos y arte que deben verse nítidos a cualquier tamaño y cortarse limpio. Illustrator es donde ya viven esos archivos, así que hice AutoSort ahí para mejorar la calidad de mi trabajo, sin convertir ni aplanar nada en el camino.

</details>

<details>
<summary><b>Dice «sin silueta legible»</b></summary>

El script no pudo capturar la silueta de ese diseño y usó su rectángulo. El resultado sigue siendo correcto, solo sin el ahorro de forma real para ese diseño.

</details>

<details>
<summary><b>Forma real tarda mucho</b></summary>

Sube la precisión a 3 o 5 mm, usa calidad Rápida, o acomoda por tandas con **Varias hojas**.

</details>

<details>
<summary><b>Aparece un error al ejecutarlo</b></summary>

Confirma que tienes la versión más reciente, reemplaza el archivo y reinicia Illustrator. Si persiste, abre un [issue](https://github.com/eguiajosue/auto-sort/issues) con una captura que muestre el número de línea.

</details>

## Desarrollo

El proyecto es un único archivo `AutoSort-Gangsheet.jsx` (ExtendScript, sintaxis ES3). El motor de acomodo por rectángulos (`PACKER`), las utilidades (`UTILS`) y el acomodo por forma (`NEST`) no dependen de Illustrator y se prueban en Node:

```sh
npm test
```

| Prueba | Qué verifica |
| --- | --- |
| `extendscript-lint` | Rechaza construcciones que ExtendScript interpreta mal (p. ej. `++`/`--` sobre propiedades). |
| `packer` | Acomodo por rectángulos: sin solapes, separación, tamaños intactos, varias hojas. |
| `nest` | Decodificador PNG/zlib, máscaras, núcleo de separación y acomodo por forma. |
| `integration` | El script completo contra una simulación de Illustrator y ScriptUI. |
| `docs-sync` | La copia descargable del sitio coincide con el script. |

La web (`docs/`) se publica con GitHub Pages. Tras cambiar el script, copia el archivo con `npm run sync-docs`.

### Publicar una versión

En **Actions → Release → Run workflow**, escribe la versión (por ejemplo `v1.1.0`); también se dispara al publicar una etiqueta `vX.Y.Z`. El flujo corre las pruebas y crea el release con `AutoSort-Gangsheet.jsx` y un zip (script + README + licencia). La descripción sale de `.github/release-notes.md`.

## Licencia

AutoSort es software libre bajo la [licencia MIT](LICENSE): puedes usarlo, leerlo, modificarlo y compartirlo, incluso en trabajo comercial. Es de código abierto para que cualquiera pueda ver exactamente qué hace con sus archivos, proponer mejoras y adaptarlo a su taller.
