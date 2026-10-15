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

Opciones:

| Opción | Descripción |
| --- | --- |
| Elementos | Selección actual, o todo lo visible y desbloqueado del documento. |
| Lienzo | Rollo (ancho fijo) o mesa de trabajo actual. |
| Entre elementos | Espacio mínimo entre piezas (para recortar). |
| Margen al borde | Espacio entre las piezas y el borde de la hoja. |
| Rotación | No rotar, o permitir giros; el sentido del giro (horario/antihorario) es elegible. |
| Calidad | Rápida / Normal / Máxima. Más calidad = prueba más combinaciones (más lento). |

## Notas

- El acomodo se hace por **rectángulo envolvente** de cada pieza (lo recomendable
  para recortar). En ese esquema 180° ocupa lo mismo que 0° y 270° lo mismo que
  90°, por eso el script solo gira cuando el giro de 90° (en el sentido elegido)
  ahorra espacio.
- Se usan los **límites visibles** (incluyen el grosor del trazo).
- Los objetos bloqueados, ocultos o en capas bloqueadas/ocultas se ignoran. En modo
  “Selección”, el resto de objetos del documento no se toma en cuenta, así que
  podrían quedar encimados con el resultado.
- Illustrator limita una mesa de trabajo a ~577 cm (227 in). Si el rollo es más
  largo, las piezas se acomodan igual pero la mesa de trabajo no se ajusta.
- Con cientos de piezas, la calidad “Máxima” puede tardar varios segundos o más
  (hay barra de progreso).

## Desarrollo

El motor de acomodo (algoritmo MaxRects con varias heurísticas y órdenes, más
búsqueda binaria del largo mínimo) está entre los marcadores `PACKER START` /
`PACKER END` del `.jsx` y no depende de Illustrator. Las pruebas lo ejecutan en Node:

```sh
npm test
```
