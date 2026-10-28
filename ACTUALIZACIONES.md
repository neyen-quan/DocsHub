# Diseño del actualizador

## Canal

latest.json: schema=1, product=DocsHub, appId=agency.neyen.workhub2, version,
patches (from/to/url/size/sha256), full (url/size/sha256). Puede contener una
transición local para la base anterior al canal online. Las descargas pertenecen
al mismo repositorio y tag de destino; las redirecciones se limitan a servidores
HTTPS de GitHub. No se guardan tokens dentro de la aplicación.

La URL elegida se guarda en el perfil local. La versión instalada se lee de la
instalación abierta. La UI es una BrowserWindow propia: no queda tapada por
WebContentsViews de GPT, Gemini o Metadatos.

## Transacción

Conexión → descarga con bytes/porcentaje/esperas/cancelación → SHA-256 del ZIP →
validación de producto/versiones/rutas/inventario → confirmación nativa →
verificación de la base exacta → preparación → respaldo → instalador visible →
cierre de DocsHub → instalación → verificación del destino → reinicio →
confirmación de React/preload/IPC. Ante fallo: recuperación y arranque anterior.

El ZIP y su estado permanecen en la operación mientras la confirmación nativa
está pendiente. El instalador debe confirmar que su ventana está cargada y
visible antes de cerrar el proceso principal. Tiene su propio proceso y perfil
temporal, sin compartir sesiones ni configuración del usuario.

La ubicación se resuelve desde el lanzador y los archivos de la instalación;
no hay rutas personales fijas. Las transacciones viven en `.docshub-updates/`
al lado del programa, sin crear nuevas instalaciones anidadas. El lanzador
libera su EXE antes de la recuperación. No borrar esa carpeta con una
actualización pendiente.

## Progreso

Cada etapa publica un estado propio. Bytes y porcentaje son medibles durante
la descarga; conteos de archivos durante preparación/respaldo/instalación.
Las esperas y comprobaciones sin porcentaje usan un indicador de actividad.
La falta de datos se muestra a los cinco segundos; conexión y descargas sin
avance tienen límites de tiempo. La cancelación tras empezar a aplicar el
parche pasa por recuperación, nunca abandona una instalación a medias.

## Limitaciones

La carpeta del programa necesita permisos de escritura. No se reemplaza el
perfil ni los archivos de trabajo. Los respaldos del programa están en el
mismo disco: no sustituyen un respaldo externo de datos ante una falla física.
Los errores de recuperación conservan el diario para reintentar con DocsHub.exe.
