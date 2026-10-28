# DocsHub

Aplicación de escritorio para Windows x64: paneles de documentos locales,
GPT Personal, GPT Alter Frame, Gemini Personal, Metadatos y Cuentas Rina.
Interfaz Electron + React, logo amarillo de documentos y lanzador nativo sin consola.

## Uso y actualizaciones

Abrir `DocsHub.exe` desde la carpeta extraída. Mantener sus carpetas al lado
del ejecutable; un acceso directo puede apuntar a él desde cualquier lugar.

**Actualizar programa → Buscar actualizaciones → Descargar e instalar.**
El canal GitHub se puede cambiar y guardar. También se puede instalar un ZIP
local y descargar un paquete completo separado para una instalación nueva o reparación.
No se extraen parches manualmente. La ventana del instalador sigue visible después
de cerrar DocsHub y muestra instalación, arranque, recuperación y reinicio.

La primera migración desde v0.1.35 se realiza seleccionando el ZIP de transición
publicado mediante el actualizador local existente. Las siguientes son online.
La aceptación en la PC del usuario requiere su confirmación; un job aprobado no la reemplaza.

## Desarrollo

Requisitos: Node.js 24, npm y Python 3.12. Para generar el paquete de entrega:
Windows x64, Visual Studio Build Tools 2022 (C/C++ x64 y Windows SDK) y su consola
Developer Command Prompt. GitHub Actions prepara ese entorno automáticamente.

```powershell
npm ci
npm run audit
npm test
npm run build
npm run dev
```

Electron 44.4.4, React 18.3.1, React DOM 18.3.1, Lucide 0.468.0 y esbuild 0.25.12
están fijados en package.json y package-lock.json. No hay dependencias Perl,
FFmpeg externo ni módulos nativos npm para la lógica de documentos.
PowerShell y los editores externos son componentes de Windows o programas del usuario.

Para una compilación local Windows:

```powershell
npm run package:win
```

El canal predeterminado se toma de `GITHUB_REPOSITORY` durante la compilación;
no contiene una dirección de repositorio inventada. Fuera de CI queda vacío
para configurarlo desde el programa.

## Repositorio y entregas

Código en `src/`, `electron/`, `shared/`; logo e iconos en `assets/`; lanzador
en `native/`; pruebas en `scripts/`; herramientas de publicación en `tools/`.
`compat/` conserva únicamente el inventario exacto y el validador necesarios
para migrar desde la entrega anterior al repositorio.

Un push a `main` con una versión nueva publica la entrega completa desde
`.github/workflows/release.yml`. Una versión ya publicada solo se verifica.
Ver [BUILD.md](BUILD.md), [ACTUALIZACIONES.md](ACTUALIZACIONES.md) y
[DATOS.md](DATOS.md). Licencia MIT; avisos de terceros en [THIRD_PARTY.md](THIRD_PARTY.md).
