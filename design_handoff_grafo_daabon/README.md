# Handoff: Rediseño del grafo — Estructura Grupo Daabon

## Overview
Rediseño de la vista **Grafo** de `estructura-daabon` (React 19 + Vite + @xyflow/react 12 + dagre + motion). Objetivo: que el grafo sea legible a tamaño completo (fit-all) y que las animaciones se sientan más cuidadas. Header, paneles laterales, leyenda y tokens **no cambian** respecto al código actual; el cambio está en layout, aristas, nodos, zoom semántico e interacción/animación del canvas.

## About the Design Files
`Estructura Grupo Daabon.dc.html` es una **referencia de diseño en HTML** (prototipo funcional con datos de `src/data/graph.ts`), no código para copiar. La tarea es **recrear este comportamiento en el código existente** (`src/App.tsx`, `src/lib/layout.ts`, `src/components/OwnershipEdge.tsx`, `src/components/CompanyNode.tsx`, `src/App.css`) usando React Flow, dagre y motion como ya se usan. La lógica del prototipo (funciones `dagreLayout`, `computeLayout`, `ortho`, `edgeGeom`, `play`) está en el `<script data-dc-script>` del HTML y puede portarse casi literal a TypeScript.

## Fidelity
**Alta fidelidad.** Colores, tipografía, radios y sombras son los de `index.css` / `App.css` / `theme.ts`. Solo cambian los valores listados abajo.

---

## 1. Layout (`src/lib/layout.ts`)

### 1.1 Tamaño de nodo
- `NODE_WIDTH = 224`, `NODE_HEIGHT = 96` (antes 220×100). Actualizar también `width/height/measured` en `App.tsx` y `.node` en CSS.

### 1.2 Las etiquetas de % entran al layout
En vez de dejar que React Flow coloque los % en el punto medio (lo que hace que se encimen), dagre reserva espacio para cada etiqueta:
```ts
const g = new dagre.graphlib.Graph({ multigraph: true })
g.setGraph({
  rankdir: dir,
  nodesep: dir === 'TB' ? 26 : 18,
  ranksep: dir === 'TB' ? 24 : 30,   // dagre duplica rangos cuando hay labels
  edgesep: 12, marginx: 0, marginy: 0,
})
edges.forEach((e, i) => g.setEdge(src, tgt,
  { width: 18 + label.length * 6.9, height: 24, labelpos: 'c' }, 'e' + i))
```
Tras `dagre.layout(g)`, guardar por arista `points` (lista de puntos) y `x, y` (centro de la etiqueta). Pasarlos al edge vía `data` (`points`, `labelX`, `labelY`).

### 1.3 Agrupar "Estructuras independientes"
1. Calcular componentes conexos (union-find sobre las aristas).
2. Componentes con **> 3 nodos** → layout dagre normal (grupo principal).
3. Componentes con **≤ 3 nodos** (p. ej. Cacata → Caribbean Eco Soap) → cada uno con su propio dagre, ordenados por tamaño desc., y empaquetados en una cuadrícula.
4. Probar columnas `1..n` y lado `right | below`. Elegir el que minimice `|ln((W/H) / aspectoCanvas)|`, donde `aspectoCanvas = (anchoCanvas − 128) / (altoCanvas − 158)` limitado a [0.8, 3].
5. Constantes: `GX=36`, `GY=36` (separación entre mini-grupos), `PAD=28`, `HEAD=58` (espacio para el título), `GAP=110` (separación con el grupo principal).
6. Dibujar un marco detrás del bloque (nodo de fondo no interactivo o `<ViewportPortal>`):
   - `border: 1px dashed #C4C4BE; border-radius: 18px; background: rgba(255,255,255,.4)`
   - Título arriba-izquierda (left 22, top 16): "ESTRUCTURAS INDEPENDIENTES", 11px/600, `letter-spacing .08em`, `#66666E` + badge mono con el conteo (`#ECECE9`, radio 4, padding 1×6).
- En modo foco no se agrupa (se hace layout solo de la cadena).
- Hacerlo configurable (en el prototipo: prop `groupIndependent`, por defecto `true`).

## 2. Aristas (`OwnershipEdge.tsx`)

### 2.1 Enrutado ortogonal (reemplaza `getSmoothStepPath`)
- **Puerto de salida:** borde inferior del origen (TB), con x = x del primer punto interior de dagre, limitado a `[x+18, x+W−18]`. Así las aristas se reparten a lo ancho de la tarjeta.
- **Puerto de llegada:** borde superior del destino, con x = último punto interior, mismo límite. La línea termina 8px antes; ahí va la punta de flecha.
- **Ortogonalización:** para cada par de puntos consecutivos `p → q`:
  - misma x (±1.5) → segmento vertical;
  - x distinta → vertical hasta `m = (p.y+q.y)/2 + lane`, horizontal hasta `q.x`, vertical hasta `q`.
  - `lane = ((edgeIndex % 5) − 2) * 4` px separa horizontales que comparten el mismo hueco entre filas.
- Quitar puntos colineales y redondear esquinas con `Q` de radio `min(8, seg/2)`.
- LR: la misma lógica con los ejes intercambiados.
- La etiqueta queda en `(labelX, labelY)` de dagre, siempre sobre un tramo vertical del camino.

### 2.2 Punta de flecha
Triángulo propio, no `markerEnd` (así se anima aparte):
- TB: `M tx−5,ty−9 L tx+5,ty−9 L tx,ty Z`, relleno con el color del tier.

### 2.3 Trazos por tier (más gruesos que antes)
| tier | stroke | ancho |
|---|---|---|
| ctrl ≥50 % | `#1F5E4A` | 2.2 |
| sig 5–50 % | `#9A6A22` | 1.6 |
| minor <5 % | `#A3A39C` | 1.1 |
| missing | `#7A1F32` | 1.3, dash `6 5` |

Aristas resaltadas: ancho × 1.45. Todos los anchos se multiplican por `--lod` (ver §4).

### 2.4 Pills de %
Estilos iguales a `.edge-pill.tier-*` de App.css (22px de alto, mono 11/600, radio 6). Resaltada: `box-shadow: 0 0 0 3px rgba(122,31,50,.14), 0 6px 14px -4px rgba(18,18,20,.28)`. Escala `scale(var(--plod))`.

Modos (prop `pillMode`):
- `Todas`: por defecto; las minor se ocultan al alejar.
- `Solo ≥ 5 %`
- `Solo al resaltar`

## 3. Nodo (`CompanyNode.tsx`)
- 224×96, padding `10px 12px 10px 15px`, radio 10, borde `#E6E6E2`, sombra `--sh-1`, gap 3.
- Rail de tipo: 3px, top/bottom 12px. En hover/selección/foco: 4px de ancho y altura completa (transición .35s ease-out).
- Fila superior: chip de tipo + grados (↓dueños ↑participadas), alto 19px.
- Nombre: 13.5px/550, line-height 1.22, máximo 2 líneas.
- NIT: mono 10.5 `#8E8E95`, 15px de alto.
- Hover: `translateY(-3px)`, borde `#C4C4BE`, sombra `0 2px 4px rgba(18,18,20,.05), 0 14px 28px -8px rgba(18,18,20,.18)`.
- Seleccionado: borde `#121214`, sombra `0 0 0 1px #121214, --sh-3` + anillo `node-pulse` (sin cambios).
- Raíz del foco: borde `#7A1F32`, sombra `0 0 0 2px #7A1F32, 0 18px 40px -12px rgba(122,31,50,.45)`.

## 4. Zoom semántico (LOD) — clave para la legibilidad
En cada cambio de viewport (`onMove` / `useOnViewportChange`), fijar variables CSS en `.react-flow__viewport`:
```ts
const lod = clamp(0.8 / zoom, 1, 1.9)
el.style.setProperty('--lod', lod)
el.style.setProperty('--plod', Math.min(lod, 1.5))       // pills
el.style.setProperty('--detail', lod > 1.06 ? '0' : '1')  // chip, grados, NIT
el.style.setProperty('--minor', zoom < 0.42 ? '0' : '1')  // pills < 5 %
el.style.setProperty('--nameMargin', lod > 1.06 ? 'auto 0' : '0') // centra el nombre
```
CSS del nodo:
- nombre: `font-size: calc(13.5px * var(--lod))`, `margin: var(--nameMargin)`;
- fila superior: `height: calc(19px * var(--detail)); opacity: var(--detail)`;
- NIT: `height: calc(15px * var(--detail)); opacity: var(--detail)`;
- las tres con transición .3s.

Resultado: con fit-all (~0.45) el nombre se ve a unos 11–12px en pantalla.

## 5. Canvas
- **Fondo liso `#F3F3F1`.** Quitar `<Background variant=Dots>` y `.canvas-spotlight`.
- **Fit inicial:** padding 64 más 30px extra abajo por la leyenda, zoom máximo 1.1. Arranca al 82 % de ese zoom y se acerca al 100 % en 1500ms (easeOutQuart). Reemplaza el `setCenter(zoom 0.9)` actual.
- **Botón "Ajustar"** y control de fit: fit-all animado de 700ms.
- **Rueda:** zoom al cursor, factor `exp(−deltaY·0.0016)` (`0.01` con ctrl/pinch), rango 0.2–2.5.
- **Cámara:** interpolar el centro en coordenadas de mundo de forma lineal y el zoom en escala logarítmica, con easeOutQuart.
- **Minimapa y controles:** igual que ahora.

## 6. Interacciones
- **Hover en nodo:** resalta sus aristas directas y sus vecinos. Los demás nodos bajan a opacidad .3 y las aristas a .1 (transición .25s).
- **Hover en arista o pill:** resalta solo esa arista y sus dos nodos.
- **Hover en un tier de la leyenda:** resalta todas las aristas de ese tier. La fila toma fondo `#F0F0ED`. Subtítulo del bloque: "Participación · pasa el cursor para resaltar".
- **Nodo seleccionado (sin hover):** sus aristas quedan resaltadas; el resto a .25 y los nodos no vecinos a .5.
- **Búsqueda o filtro de tipo del panel izquierdo:** atenúan en el grafo los nodos que no coinciden (.22) y sus aristas (.14).
- **Clic en nodo:** lo selecciona y abre el panel derecho si estaba recogido. Tras la transición de la grilla (540ms), si el nodo quedó fuera de vista, la cámara lo centra sin cambiar el zoom.
- **Clic en una fila de la lista o del detalle:** selecciona y aplica la misma regla de visibilidad.
- **Doble clic:** foco en la cadena (sin cambios de lógica).
- **Tecla `/`:** abre el panel izquierdo y enfoca la búsqueda. **Esc:** limpia el foco.
- **Flujo (prop `showFlow`, por defecto on):** sobre las aristas resaltadas va un trazo extra, color del tier, `stroke-width: calc(3.6px*var(--lod))`, `stroke-dasharray: .1 13.9`, `linecap round`, con `@keyframes flow { to { stroke-dashoffset: -14 } }` a .9s linear infinite. Son puntos que avanzan en la dirección de la propiedad.

## 7. Animaciones (Web Animations API o motion)
`EASE = cubic-bezier(.16,1,.3,1)`. El rango (`rank`) es el índice del nivel del nodo en el eje principal.

### Entrada (una vez)
| elemento | animación | duración | delay |
|---|---|---|---|
| tarjeta | opacity 0→1, `translateY(18px) scale(.94)` → none | 750ms | `220 + rank·115` |
| arista sólida | draw: `dasharray L L`, `dashoffset` L→0 | 850ms | `520 + rankOrigen·115` |
| arista sin % | opacity 0→1 | 500ms | draw + 200 |
| flecha | opacity 0→1 | 220ms | draw + 620 |
| pill | opacity 0→1, `scale(.55→1)`, `cubic-bezier(.34,1.56,.64,1)` | 480ms | draw + 380 |

### Relayout (vertical ⇄ horizontal, entrar o salir de foco, agrupar)
- Los nodos se deslizan a su nueva posición: `transform .75s cubic-bezier(.65,0,.35,1)`. Se puede mantener `useTweenedNodes`.
- Aristas, flechas y pills se ocultan al instante y se vuelven a dibujar con los mismos keyframes: base 560ms, paso 60ms por rango.
- Al mismo tiempo, la cámara hace fit en 950ms.
- Al salir del foco se restaura el viewport guardado (igual que ahora).

### Otros
- Banner de foco: `translate(-50%,-14px) scale(.96)` → normal en .5s con `cubic-bezier(.34,1.3,.64,1)`.
- Detalle y leyenda al abrirse: `translateY(10px)` → 0 y opacity 0→1 en .35–.45s con EASE.

## 8. Responsive (header)
- Menos de 1280px: ocultar `.header-stats`.
- Menos de 1100px: ocultar `.icon-btn-label`.
- En el grid raíz, usar `grid-template-columns: minmax(0,1fr)` y dar `min-width: 0` al header.

## Design Tokens
Sin cambios respecto a `src/index.css` y `src/lib/theme.ts`, salvo los anchos de trazo de §2.3.

## Assets
No hay assets nuevos. Todos los íconos SVG son los inline que ya existen en `Header.tsx`, `CompanyNode.tsx`, `LeftPanel.tsx` y `DetailPanel.tsx`. Se usa `dagre@0.8.5`, que ya es dependencia.

## Files
- `Estructura Grupo Daabon.dc.html`: prototipo de referencia. Ábrelo en el navegador; la lógica está en el `<script data-dc-script>`.
- Archivos a modificar en el repo:
  - `src/lib/layout.ts`: §1
  - `src/components/OwnershipEdge.tsx`: §2
  - `src/components/CompanyNode.tsx`: §3
  - `src/App.tsx`: §4–§7
  - `src/App.css`: §3–§5 y §8
