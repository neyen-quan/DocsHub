# Compilación y publicación

## Flujo automático

1. Editar el código e incrementar `package.json` y la raíz de `package-lock.json`.
   El número visible se importa desde package.json al compilar React.
2. Subir el commit a `main`. No crear tags ni releases manuales.
3. GitHub Actions Windows fija Node/Python, usa `npm ci`, audita y prueba.
4. Recupera el paquete completo publicado anterior y verifica su inventario.
   Si el motor y el lanzador no cambiaron, reutiliza esos bytes exactos.
5. Compila la interfaz y el lanzador con `/MT` (sin exigir el redistribuible VC++).
6. Genera el paquete completo, el parche de archivos modificados y latest.json.
7. Prueba en Windows el EXE, el diálogo modal nativo, el instalador con ventana,
   la actualización incremental, la recuperación y la conservación de datos.
8. Crea la release como borrador; sube los archivos sin sobrescribir assets;
   descarga y verifica tamaños, SHA-256 e inventarios; luego publica el canal.

## Bases de parches

La base es un paquete publicado exacto. Nunca se vuelve a compilar un tag para
usarlo como base. `assets/docshub-installation.json` contiene el inventario de
archivos propios del programa. El ZIP verifica origen/destino y cambios, incluidas
eliminaciones limitadas a archivos propios de la versión anterior.

La base v0.1.35 está en `compat/legacy-v0.1.35-inventory.json`: se obtuvo de los
ZIP distribuidos, no de una compilación aproximada. Su transición usa formato 1,
aceptado por el actualizador anterior; los parches online usan formato 2.

No se descargan runtimes sin cambios. Si cambian, solo los archivos distintos
se incluyen en el parche y el instalador usa una copia local independiente del
motor anterior para poder reemplazarlos. El punto de recuperación y el lanzador
se mantienen estables entre versiones normales.

## Recuperación de una entrega

Actions → Publicar DocsHub → Run workflow, seleccionar `main` e indicar un tag
existente (`vX.Y.Z`). Se conservan las herramientas actuales de main y se compila
el código del tag; no se reejecuta el job antiguo del tag. Si la release ya está
publicada, solo se verifican sus archivos. Si existe un paquete de esa versión,
se reutiliza; no se recompila ni sobrescribe una base publicada.

Una release publicada es inmutable. Un asset existente con distinto hash detiene
la publicación. Para cambiar el programa se incrementa la versión.
