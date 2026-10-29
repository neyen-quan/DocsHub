# Trabajo en DocsHub

- Este repositorio es solo DocsHub. Conservar appId, perfil Neyen.Workhub2 y
  particiones existentes. No editar WorkHub, MSGHub ni sus repositorios.
- Inspeccionar main, package.json y la última release real antes de cambiar.
- Auditar fuentes y recursos; no incluir perfiles, credenciales, documentos,
  descargas, bases del usuario ni rutas personales. Mantener DATOS.md actualizado.
- El usuario autorizó implementar sus cambios, incrementar la versión y subir
  directamente a main. El pipeline crea tag/release/assets; no duplicarlos a mano.
- Versionar package.json y package-lock.json. Ejecutar auditoría/pruebas locales y
  comprobar el job de Windows. Leer logs, corregir y volver a publicar cuando falle.
- Nunca recompilar ni sobrescribir archivos de una versión publicada que se use
  como base. Deltas contra el paquete publicado exacto y su inventario.
- No repetir un run defectuoso antiguo de un tag. Usar workflow_dispatch desde
  main con el tag existente y las herramientas actuales del pipeline.
- Anunciar una actualización solo después de verificar todos los assets reales,
  latest.json y el resultado Windows. Mantener pendiente la aceptación en la PC
  hasta la confirmación del usuario.
- No cambiar el launcher ni desktop-start.cjs en parches normales: son el punto
  estable de recuperación. Si se necesita cambiarlos, diseñar una transición
  compatible y comprobar el escenario de corte durante la propia transición.
- El progreso del instalador vive en memoria/IPC. Nunca hacer depender instalación
  o recuperación de escribir/renombrar progress.json. Mantener las pruebas con
  bloqueos reales de Windows y reintentos asíncronos de los diarios críticos.
