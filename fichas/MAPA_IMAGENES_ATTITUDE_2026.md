# Mapa de imágenes · Ficha Técnica Dinámica · Dodge Attitude 2026

Cuenta Cloudinary (cloud name): `bfxvgiaz`
Carpeta raíz: `ficha-attitude-2026`
Base de entrega: `https://res.cloudinary.com/bfxvgiaz/image/upload/{TRANSFORMACIÓN}/ficha-attitude-2026/{public_id}`

## Transformaciones
- Fotos (galería): `f_auto,q_auto,w_1600`
- Autos por color (recorte de fondo + encuadre): `e_background_removal/c_pad,w_2880,h_1613,b_transparent/c_crop,w_1900,h_1064,g_center/f_auto,q_auto,w_1400`
  - La primera vez que se pide cada auto, Cloudinary tarda unos segundos (responde 423); después queda en caché. Ya se pidieron los 11.
  - No cambiar el ancho de esta transformación por dispositivo: cada variante nueva vuelve a correr el recorte y gasta créditos.

## Etiquetas en Cloudinary (para que el módulo busque y cambie imágenes)
- Todas: `ficha-attitude-2026`
- Galería: `galeria` + `exterior` o `interior`
- Colores: `colores` + `version-sxt|sport|gt` + `color-blanco|granito|negro|plata`
- Slot de la ficha: `slot-<nombre>` (ver tabla). Para cambiar una foto: quitar el tag `slot-…` de la imagen actual y ponerlo en la nueva (o cambiar el valor en `ASSETS` dentro del código).

## Slots (lugares de la ficha) → imagen
| Slot (clave en `ASSETS`) | Uso | public_id | Tags de slot |
|---|---|---|---|
| hero-neon | Película 1 | galeria/exterior/ext-12 | slot-hero-neon, slot-pelicula-01 |
| ext-frente-oscuro | Película 2 | galeria/exterior/ext-15 | slot-ext-frente-oscuro, slot-pelicula-02 |
| ext-lateral | Película 3 | galeria/exterior/ext-01 | slot-ext-lateral, slot-pelicula-03 |
| ext-faro | Película 4 y fondo del panel | galeria/exterior/ext-04 | slot-ext-faro, slot-pelicula-04, slot-fondo-panel |
| ext-trasera-pista | Película 5 | galeria/exterior/ext-02 | slot-ext-trasera-pista, slot-pelicula-05 |
| rin-gt | Película 6 | galeria/exterior/ext-14 | slot-rin-gt, slot-pelicula-06 |
| int-tablero | Película 7 y cabina con puntos de equipo | galeria/interior/int-31 | slot-int-tablero, slot-pelicula-07, slot-cabina-hotspots |
| int-panel | Película 8 | galeria/interior/int-22 | slot-int-panel, slot-pelicula-08 |
| int-asientos-piel | Película 9 | galeria/interior/int-33 | slot-int-asientos-piel, slot-pelicula-09 |

Nota: los puntos (hotspots) de la cabina están en % sobre `int-tablero`. Si se cambia esa foto, hay que reubicarlos.

## Autos por versión y color (clave `car-<versión>-<color>`)
| Slot | public_id |
|---|---|
| car-sxt-blanco | colores/sxt-blanco |
| car-sxt-granito | colores/sxt-granito |
| car-sxt-plata | colores/sxt-plata |
| car-sport-negro | colores/sport-negro |
| car-sport-blanco | colores/sport-blanco |
| car-sport-granito | colores/sport-granito |
| car-sport-plata | colores/sport-plata |
| car-gt-negro | colores/gt-negro |
| car-gt-blanco | colores/gt-blanco |
| car-gt-granito | colores/gt-granito |
| car-gt-plata | colores/gt-plata |

## Galería completa subida (2880×1591)
- Exterior (13): ext-01, 02, 04, 05, 06, 07, 09, 10, 11, 12, 13, 14, 15 → `galeria/exterior/ext-NN`
- Interior (25): int-16 a int-40 → `galeria/interior/int-NN`
Los números son los de la galería oficial de dodge.com (faltan los que Dodge no publica, como el 03 y el 08).

## Cómo usarlo en el código (ficha7)
En el bloque `CONFIG` y `CLOUD`/`ASSETS` del HTML:
- `CONFIG.SOURCE = "cloudinary"` en producción. `"local"` solo sirve para la vista previa dentro de Claude, que bloquea imágenes externas.
- `CLOUD.NAME`, `CLOUD.FOLDER`, `CLOUD.TX_PHOTO`, `CLOUD.TX_CAR` definen la base y las transformaciones.
- `ASSETS` es el único lugar donde cada slot apunta a una imagen. El módulo solo debe leer y editar ese objeto.
- Para otro vehículo: nueva carpeta en Cloudinary, mismo esquema de slots y se cambia `CLOUD.FOLDER` y `ASSETS`.

## Video (slot-video)
- Asset: `ficha-attitude-2026/Video/attitude_web` (original 720×1280, 31.7 s, 30.8 MB)
- Entrega optimizada (≈5.2 MB): `https://res.cloudinary.com/bfxvgiaz/video/upload/f_auto,q_auto,w_720/attitude_web`
- Poster: `https://res.cloudinary.com/bfxvgiaz/video/upload/so_1,f_jpg,q_auto,w_720/attitude_web.jpg`
- En el código: `CLOUD.VIDEO`, `CLOUD.TX_VIDEO`, `CLOUD.TX_POSTER`. Carga solo al tocar el botón, inicia sin sonido y, si falla, se muestra la película de fotos.

## Ficha técnica en PDF (slot-pdf)
- Asset (tipo raw): `ficha-attitude-2026/documentos/ficha-tecnica-attitude-2026.pdf` (842,749 bytes), tags: ficha-attitude-2026, documento, slot-pdf
- Descarga: `https://res.cloudinary.com/bfxvgiaz/raw/upload/fl_attachment:ficha-tecnica-dodge-attitude-2026/ficha-attitude-2026/documentos/ficha-tecnica-attitude-2026.pdf`
- Requiere activar "PDF and ZIP files delivery" en Cloudinary (Settings > Security); si no, responde 401.
