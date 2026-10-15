# AutoSort Gangsheet DTF (Adobe Illustrator)

Script para Illustrator que acomoda automáticamente varios diseños en una hoja
para **gangsheets DTF**, aprovechando al máximo el espacio y dejando una
separación entre piezas para poder recortarlas.

## Qué hace

- **No cambia el tamaño** de ningún elemento: solo los **mueve** y, si lo permites,
  los **gira** (0° / 90° / 180° / 270°).
- **Los grupos se tratan como una sola pieza**, incluidos los grupos con máscara
  de recorte (se mide la forma de la máscara, no el arte oculto). Si seleccionas
  algo dentro de un grupo, se acomoda el grupo completo.
- Dos modos de lienzo:
  - **Ancho fijo, largo automático (rollo DTF)**: indicas el ancho (p. ej. 58 cm
    o 22 in) y el script busca el **largo mínimo**. Opcionalmente ajusta la mesa de
    trabajo al resultado y redondea el largo hacia arriba a unidad entera.
  - **Mesa de trabajo actual**: acomoda dentro del artboard activo. Lo que no
    quepa se coloca a la derecha de la mesa de trabajo y queda seleccionado.
- Separación entre elementos y margen al borde configurables (por defecto **3 mm**),
  en mm, cm o in.
- **Varias hojas**: si no cabe todo, continúa en mesas de trabajo nuevas
  (*Gangsheet - Hoja 2, 3…*) a la derecha. En modo rollo eliges el largo máximo
  por hoja y la última se acorta al mínimo; en modo mesa de trabajo cada hoja nueva
  tiene el tamaño de la actual.
- **Cantidades por diseño y tallas**: cada diseño puede tener varias filas
  (p. ej. *Logo · S ×5*, *Logo · M ×10*). Cada copia lleva una **etiqueta
  discreta** con su talla (XS, S, M, L, XL, 2XL, 3XL, 4XL o texto personalizado)
  debajo del diseño; su espacio se reserva al acomodar.
- **Revisión previa (preflight)**: avisa de imágenes con baja resolución a su
  tamaño real, vínculos rotos, líneas muy finas, textos pequeños y textos sin
  convertir a contornos.
- **Largo de la hoja**: exacto, redondeado a unidad entera o el **menor tamaño
  estándar** donde quepa (lista editable).
- **Costo estimado** según tu precio por cm, m, in o ft de largo.
- **Exportar PNG transparente** a la resolución elegida (300 ppi por defecto), en
  la carpeta del documento, con la medida en el nombre del archivo.
- Recuerda la última configuración usada.

## Instalación

1. Copia `AutoSort-Gangsheet.jsx` a la carpeta de scripts de Illustrator:
   - **Windows**: `C:\Program Files\Adobe\Adobe Illustrator <versión>\Presets\<idioma>\Scripts\`
   - **macOS**: `/Applications/Adobe Illustrator <versión>/Presets.localized/<idioma>/Scripts/`
2. Reinicia Illustrator.
3. Ejecuta **Archivo > Secuencias de comandos > AutoSort-Gangsheet**.

Sin instalar: **Archivo > Secuencias de comandos > Otra secuencia de comandos…** y
elige el archivo. Puedes asignarle un atajo de teclado con una Acción.

## Uso

1. Abre el documento con tus diseños (cada diseño como objeto o grupo).
2. Selecciona las piezas a acomodar (o ninguna, y elige “Todo lo visible y desbloqueado”).
3. Ejecuta el script, ajusta las opciones y pulsa **Acomodar**.

La ventana tiene tres pestañas:

**Acomodo**

| Opción | Descripción |
| --- | --- |
| Elementos | Selección actual, o todo lo visible y desbloqueado del documento. |
| Lienzo | Rollo (ancho fijo) o mesa de trabajo actual. |
| Entre elementos | Espacio mínimo entre piezas (para recortar). |
| Margen al borde | Espacio entre las piezas y el borde de la hoja. |
| Rotación | No rotar, o permitir giros; el sentido del giro (horario/antihorario) es elegible. |
| Calidad | Rápida / Normal / Máxima. Más calidad = prueba más combinaciones (más lento). |
| Varias hojas | Continúa en hojas nuevas si no cabe todo; largo máximo por hoja (rollo) y máximo de hojas. |

**Cantidades**

Lista de diseños con columnas *Pieza · Tamaño · Talla · Copias*. Selecciona una o
varias filas y:

- **Tallas por diseño…**: abre una ventana con XS, S, M, L, XL, 2XL, 3XL, 4XL,
  “sin etiqueta” y 3 tallas personalizadas; escribe cuántas copias de cada una y
  se crean todas las filas de ese diseño de una vez (también sirve con varios
  diseños seleccionados).
- **Asignar copias**: cambia cuántas copias se acomodan (0 = no acomodar).
- **Asignar talla**: pone la etiqueta elegida a las filas seleccionadas.
- **Agregar talla**: crea otra fila del mismo diseño con la talla y copias indicadas
  (así un diseño puede ir en S, M, L... a la vez).
- **Quitar fila** / **Reiniciar lista**.

Con **“Mostrar en el lienzo la pieza seleccionada”** activado, al elegir una fila
de la lista se selecciona y centra esa pieza en el documento para identificarla.
Si cancelas, se restaura tu selección original.

Si el nombre de un objeto o grupo (panel Capas) termina en `x10`, toma 10 copias
automáticamente. La etiqueta usa Arial negro; su tamaño de letra (7 pt por
defecto) y separación del diseño (1.5 mm) son configurables. Las etiquetas se
crean en la capa **“Etiquetas de talla”**: ocúltala si no quieres imprimirlas.
La talla también se guarda en la nota (*Atributos*) de cada copia, así que si
vuelves a ejecutar el script las copias conservan su talla; las etiquetas
anteriores de esa mesa de trabajo se reemplazan.

> Importante: la etiqueta se imprime en la película. Al estar separada del diseño
> puedes recortarla, o ocultar la capa antes de imprimir/exportar.

**Salida**

| Opción | Descripción |
| --- | --- |
| Ajustar la mesa de trabajo | Modo rollo: cambia el largo del artboard al resultado. |
| Largo | Exacto, redondeado a unidad entera o tamaño estándar (lista separada por `;`). |
| Costo estimado | Precio por cm, m, in o ft de largo (0 = no calcular). |
| Exportar PNG | PNG transparente a N ppi en la carpeta del documento. |
| Revisión (preflight) | Resolución mínima (ppi) y grosor mínimo de línea. |

## Notas

- El acomodo se hace por **rectángulo envolvente** de cada pieza (lo recomendable
  para recortar). En ese esquema 180° ocupa lo mismo que 0° y 270° lo mismo que
  90°, por eso el script solo gira cuando el giro de 90° (en el sentido elegido)
  ahorra espacio.
- Se usan los **límites visibles** (incluyen el grosor del trazo).
- Los objetos bloqueados, ocultos o en capas bloqueadas/ocultas se ignoran. En modo
  “Selección”, el resto de objetos del documento no se toma en cuenta, así que
  podrían quedar encimados con el resultado.
- El lienzo de Illustrator mide ~577 × 577 cm y ninguna mesa de trabajo puede
  salirse de él. Si la hoja no cabe hacia abajo, el script sube la mesa de trabajo;
  si es más larga que el lienzo, avisa (sin modificar nada) y sugiere activar
  **Varias hojas**. Las hojas que ya no quepan en el lienzo se descartan y se avisa.
- Con **Varias hojas**, al volver a ejecutar el script se eliminan las hojas
  *Gangsheet - Hoja N* creadas antes (y sus etiquetas) para generarlas de nuevo.
- Se exporta un PNG por hoja (`_hoja1`, `_hoja2`…).
- Exportar PNG usa *Exportar para pantallas* (Illustrator CC 2018+), y en versiones
  anteriores *imageCapture*. Hojas muy largas a 300 ppi generan imágenes enormes
  (58 × 500 cm ≈ 6850 × 59000 px) y pueden tardar o fallar por memoria.
- La resolución efectiva se calcula para imágenes incrustadas y vinculadas
  (PNG, JPG, TIFF, PSD…) según su escala en el documento.
- Con cientos de piezas, la calidad “Máxima” puede tardar varios segundos o más
  (hay barra de progreso).

## Desarrollo

El motor de acomodo (algoritmo MaxRects con varias heurísticas y órdenes, más
búsqueda binaria del largo mínimo) está entre los marcadores `PACKER START` /
`PACKER END` del `.jsx`, y las utilidades puras entre `UTILS START` / `UTILS END`;
ninguno depende de Illustrator. Las pruebas lo ejecutan en Node:

```sh
npm test
```

`test/integration.test.js` ejecuta el script completo contra una simulación del
DOM de Illustrator y de ScriptUI (`test/illustrator-mock.js`), incluidos los
límites del lienzo, para probar diálogos, copias, tallas y varias hojas.
