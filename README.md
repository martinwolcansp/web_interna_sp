# SP Intranet — Web Interna SP Seguridad Privada

Plataforma interna multipágina para uso institucional.  
Desarrollada con HTML semántico, CSS modular y JavaScript vanilla.

---

## Estructura del proyecto

```
sp-intranet/
│
├── pages/                      # Páginas HTML del sitio
│   └── mapa-servicios.html     # Mapa de servicios (Hogar / Comercio / Transversales)
│
├── css/                        # Estilos separados por responsabilidad
│   ├── tokens.css              # Variables CSS: colores, tipografía, espaciado, bordes, sombras
│   ├── base.css                # Reset y estilos globales del body
│   ├── components.css          # Componentes reutilizables (header, cards, modal, botones, tabs…)
│   ├── ficha.css               # Estilos específicos de la Ficha de Producto
│   └── mapa-servicios.css      # Sobreescrituras y layout propios del Mapa de Servicios
│
├── js/                         # Scripts separados por página/responsabilidad
│   ├── mapa-servicios.js       # Lógica del Mapa: segmentos, modal, navegación
│   └── ficha.js                # Lógica de la Ficha: tabs internos, FAQ accordion
│
├── assets/
│   ├── images/                 # Imágenes del proyecto
│   └── icons/                  # Íconos propios (SVG, etc.)
│
└── README.md
```

---

## Cómo agregar una nueva página

1. Crear el archivo `.html` en `/pages/`.
2. Enlazar los CSS en orden: `tokens.css → base.css → components.css → [page].css`.
3. Crear el CSS específico en `/css/` solo si la página tiene estilos únicos.
4. Crear el JS específico en `/js/` solo si la página tiene lógica propia.
5. Reutilizar las clases de `components.css` antes de escribir CSS nuevo.

---

## Convención de naming

| Tipo            | Formato                | Ejemplo                     |
|-----------------|------------------------|-----------------------------|
| Clases HTML/CSS | BEM-like con `__`/`--` | `.service-card__name`       |
| Estados         | Prefijo `is-`          | `.segment-tab.is-active`    |
| Variables CSS   | `--categoria-nombre`   | `--color-navy`, `--space-4` |
| Archivos JS     | kebab-case             | `mapa-servicios.js`         |
| IDs en HTML     | kebab-case descriptivo | `#modal-overlay`            |

---

## Variables CSS principales (`tokens.css`)

```css
--color-navy     → Azul oscuro corporativo
--color-blue     → Azul primario
--color-red      → Rojo de acento y alertas
--font-base      → Tipografía del sistema
--space-[n]      → Sistema de espaciado (4px, 8px, 12px…)
--radius         → Radio de borde principal (12px)
--shadow-xs      → Sombra sutil
```

---

## Componentes reutilizables disponibles

| Componente          | Clase principal        | Archivo CSS         |
|---------------------|------------------------|---------------------|
| Header del sitio    | `.site-header`         | `components.css`    |
| Tabs de segmento    | `.segment-tab`         | `components.css`    |
| Tabs de sección     | `.section-tab`         | `components.css`    |
| Hero de segmento    | `.segment-hero`        | `components.css`    |
| Card de servicio    | `.service-card`        | `components.css`    |
| Card transversal    | `.transversal-card`    | `components.css`    |
| Modal               | `.modal-overlay`       | `components.css`    |
| Botones             | `.btn`                 | `components.css`    |
| Tags/pills          | `.tag`, `.pill`        | `components.css`    |
| Status badges       | `.status-badge`        | `components.css`    |
| Footer del sitio    | `.site-footer`         | `components.css`    |
| Tablas              | `.data-table`          | `ficha.css`         |
| FAQ accordion       | `.faq-item`            | `ficha.css`         |
| Pasos de proceso    | `.process-step`        | `ficha.css`         |
| Checklist           | `.checklist`           | `ficha.css`         |

---

## Para trabajar en StackBlitz

1. Subir la carpeta `sp-intranet/` completa.
2. Abrir `pages/mapa-servicios.html` como punto de entrada.
3. Los archivos CSS y JS se cargan con rutas relativas `../css/` y `../js/`.

---

## Para colaboración en GitHub

- Cada página nueva → rama `feature/nombre-pagina`
- Cambios en `tokens.css` → validar impacto en todas las páginas existentes
- No usar estilos inline salvo excepciones documentadas en el código

---

*SP Seguridad Privada SA — Uso interno*
