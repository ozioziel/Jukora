# Dirección visual y accesibilidad

## Identidad

- Cielo nocturno carbón (`#0b0d12`), crema para leer (`#f3e9d7`), ámbar de estrella para acción y foco (`#f2a93b`); terracota y turquesa solo como acentos.
- Titulares editoriales en **Fraunces** y la interfaz en **Manrope** (ambas con licencia OFL, alojadas en el proyecto vía Fontsource).
- Botones transparentes con contorno de 1 px: al pasar el cursor se elevan 3 px y se tiñen; al presionar se reducen al 98 %.
- El jucumari es un oso andino original hecho solo de estrellas y líneas finas, con los «anteojos» marcados y el ojo como estrella más brillante. No usa fotos ni constelaciones reales.
- Los detalles de los nueve departamentos son discretos (uno por composición): motivos lineales en los paneles del Inicio, estados vacíos y pie de página.

## Movimiento

| Escena | Técnica | Sin movimiento (`prefers-reduced-motion`) |
|---|---|---|
| Inicio, 6 paneles | Canvas 2D: una población de partículas que se forma y se desarma por figura; GSAP ScrollTrigger con `scrub`; el estado depende solo del progreso del scroll (reversible) | Figura estable del panel visible, sin transiciones |
| Halo del cursor | Un solo overlay con interpolación en `requestAnimationFrame`; no intercepta clics; se oculta en pantallas táctiles y en diálogos de firma o pago | Desactivado |
| Casas | Puerta SVG con bisagra (CSS `transform`), luz cálida, también con foco de teclado | Sin transición |
| Búsqueda | Oso → estrella → Tierra de puntos; la órbita dura lo que dure el trabajo real y las tarjetas salen del planeta (Motion) | Resultado inmediato con estados en `aria-live` |
| Tarjeta → resultados | View Transitions API (la tarjeta pasa a ser la cabecera) | Navegación normal |

Las animaciones se pausan fuera de vista y con la pestaña oculta; el DPR está limitado y en móvil hay menos partículas.

## Accesibilidad

- Enlace «Saltar al contenido», foco visible ámbar, navegación por teclado, diálogos con foco atrapado y Escape.
- Estados con texto además de color (verificación, DEMO, testnet, estados de pedido).
- Contraste medido (luminancia relativa WCAG) sobre el fondo `#0b0d12` / la superficie `#161a22`: crema 16,15 / 14,48; atenuado 7,84 / 7,03; ámbar 9,73 / 8,73; peligro 5,77 como mínimo; éxito 6,93; turquesa 7,22. Todos cumplen AA (≥ 4,5:1). Volver a medir si cambian los tokens.
- Probado con Playwright en escritorio (1366×820) y móvil (Pixel 7), y con movimiento reducido.

## Idiomas

Español y inglés completos. Quechua (variante boliviana) y aimara en **beta**: traducciones de los textos principales, **por validar con hablantes**; lo que falta se muestra en español.
