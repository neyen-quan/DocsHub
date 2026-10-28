# Datos persistentes y privacidad

Se conserva el identificador histórico `Neyen.Workhub2` para que una
actualización no cree un perfil nuevo. El nombre visible es DocsHub.

| Ubicación | Contenido | Actualización |
|---|---|---|
| `%APPDATA%\Neyen.Workhub2\browser` | Cookies, sesiones, particiones de GPT/Gemini, Local Storage y preferencias de pestañas, divisiones, carpetas y tema | Se conserva |
| `%APPDATA%\Neyen.Workhub2\cuentas-rina` | Gastos/categorías en USD, JSON con integridad y hasta 30 respaldos | Se conserva |
| `%APPDATA%\Neyen.Workhub2\metadata-downloads.json` | Carpeta elegida para descargas de Metadatos | Se conserva |
| `%APPDATA%\Neyen.Workhub2\document-undo` | Diario y respaldos de operaciones de documentos | Se conserva |
| `%APPDATA%\Neyen.Workhub2\document-edits` | Copias de edición, sesiones y programas configurados | Se conserva |
| `%APPDATA%\Neyen.Workhub2\document-thumbnails` | Caché de miniaturas de video | Se conserva |
| `%APPDATA%\Neyen.Workhub2\document-clipboard` | Archivos temporales del portapapeles | Se conserva |
| `%APPDATA%\Neyen.Workhub2\update-channel.json` | URL del canal elegida por el usuario | Se conserva |
| `%APPDATA%\Neyen.Workhub2\updates\downloads` | ZIP descargado pendiente o verificado | Temporal; no se elimina mientras se confirma |
| Carpetas elegidas por el usuario | Documentos, imágenes, videos, ZIP y descargas | Nunca forman parte del paquete |
| `%TEMP%` con prefijos de DocsHub | Extracciones, adjuntos, arrastre y edición temporales | Datos locales de trabajo |
| Carpeta del programa `.docshub-updates` | Diario, respaldo del programa, etapas y motor de recuperación si hace falta | Solo transacciones de actualización |

Cuentas Rina guarda al confirmar cada gasto, edición o cambio de categorías;
los formularios sin confirmar no se consideran registrados. CSV exporta gastos;
JSON exporta/restaura el registro completo. Ninguno se sube a GitHub.

La auditoría revisa código, recursos y documentación. `.gitignore` excluye
motores descargados, compilaciones, perfiles, bases, ZIP, credenciales y trabajo.
El canal se inyecta en CI desde el repositorio real. El código no contiene
correos privados, rutas personales de trabajo, cookies ni tokens.
