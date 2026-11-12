# Sabi — Plan por pasos

Guía personal para usar Sabi, mejorarlo y presentarlo en tu portafolio. La documentación técnica en inglés está en el `README.md`.

## Lo que ya está hecho

- **Llenado con revisión:** vista previa de los campos, solo campos visibles y solo frames de confianza.
- **Perfil base + roles:** cada rol cambia título, resumen, años, salario y portafolio. Sabi elige el rol según el título de la vacante.
- **Importar desde CV:** PDF, DOCX o TXT, en el navegador y sin subir nada.
- **Respuestas guardadas,** para todos los roles o solo para uno.
- **Historial** con status, notas y rol, y exportación a Excel o CSV.
- **Integraciones** con el patrón Adapter: Google Sheets, ClickUp, archivo Excel y webhook firmado.
- **Auditoría de seguridad** con una vacante trampa. Los 11 hallazgos se corrigieron y tienen tests.
- **Rebranding** a Sabi 🐸: ícono, paleta, Inter y modo oscuro.
- **Compatible con Chrome, Edge, Brave y Firefox.**
- **114 tests,** typecheck limpio y `web-ext lint` con 0 errores.

## Cómo usarlo

### 1 · Instalar (10 min)
1. Corre `npm install`, `npm run build` y `npm test`.
2. **Chrome:** abre `chrome://extensions` → **Modo desarrollador** → **Cargar descomprimida** → carpeta `dist`.
3. **Firefox:** corre `npm run build:firefox`, abre `about:debugging` → **Load Temporary Add-on…** → `dist-firefox/manifest.json`.

### 2 · Configurar tu perfil (15 min)
1. **Profile → Base info → Import from your CV.** Revisa lo que encontró y guarda.
2. **Backup → Import JSON** → `sabi-mis-roles.json`, que está en `Documents\dev\myown` fuera del repo. Así cargas tus 6 roles.
3. Entra a cada rol (las *pills* de Profile) y escribe su resumen, sus años y su salario.
4. **Integrations → Google Sheets:** copia el script, pégalo en Apps Script, publícalo y pega la URL.

### 3 · Postular
1. Abre la vacante y luego Sabi. Revisa **Applying as** y cámbialo si hace falta.
2. **Review & fill** → revisa la lista → **Fill selected fields**. Revisa siempre el formulario antes de enviarlo.
3. Escribe las preguntas abiertas que falten y guárdalas con **Save my answers from this page**.
4. **Save application** guarda la postulación en el navegador y en tu Google Sheet, con el rol con el que aplicaste.

### 4 · Dar seguimiento
Cambia el **Status** en tu Google Sheet. Con la columna **Profile** puedes ver qué rol te consigue más entrevistas.

## Siguientes pasos

### Paso 1 · Probar con vacantes reales (esta semana)
Cuando un campo no se llene bien, revisa su `label` o su `name` con DevTools. Agrega un patrón en `src/core/rules.ts` y un caso en `tests/matcher.test.ts`. El ciclo bug → test → fix es muy buena historia para entrevistas.

### Paso 2 · Probar en Firefox real (30 min)
Sigue la lista de `docs/firefox.md`. Si algo falla, abre **Inspect** en `about:debugging` y guarda el error.

### Paso 3 · CI con GitHub Actions (1 hora)
Un workflow que corra `typecheck`, `test`, `build` y `lint:firefox` en cada push, con el badge en el README.

### Paso 4 · Pulir el repo (1 hora)
- Renombra el repo a `sabi` en GitHub → Settings.
- Fíjalo (pin) en tu perfil.
- Agrega un GIF corto al README.
- Agrega un archivo `LICENSE`: `package.json` dice MIT, pero el archivo todavía no existe.

### Paso 5 · Publicar
- **Firefox Add-ons:** gratis. Corre `npm run zip:firefox` y lee las notas de `docs/firefox.md`.
- **Chrome Web Store:** pago único de USD 5. Necesitas una política de privacidad corta y capturas de 1280×800.
- Antes de publicar, sube la versión del `manifest.json`. Hoy es `0.1.0` y ya tiene muchas funciones nuevas.

### Paso 6 · Contarlo
- Escribe un post en tu blog de DEV: *"I built a Chrome extension for my job search, then I hacked it"*.
- Agrégalo a geneg.com.mx como proyecto destacado.

### Ideas para después
- Soporte para Ashby y Workday. Workday usa dropdowns propios, no `<select>`, y es un buen reto técnico.
- Un badge en el ícono con el número de campos que se pueden llenar.
- Mover la tarea de ClickUp cuando cambias el status.
- Un backend opcional en Laravel para sincronizar el historial entre computadoras.

## Cómo contarlo en entrevistas (inglés sencillo)

> "I was applying to many jobs and I was tired of typing the same information. So I built Sabi, a browser extension for Chrome and Firefox, with TypeScript.
>
> It reads my CV, and I can have different roles, like Frontend or Data Analyst. When I open a job, Sabi picks the right role from the job title, shows me a preview of the fields, and fills only what I confirm. It also saves every application in my Google Sheet, so I can track the status.
>
> To save the applications in different places, I used the Adapter pattern: Google Sheets, ClickUp and Excel each have an adapter with the same interface. Adding a new one does not change the rest of the code.
>
> Then I audited my own extension. I built a fake job page with hidden fields and third-party iframes, and I found that it could steal data. I fixed it: now Sabi only fills fields you can see, and only in trusted frames. Every finding has a test. Today the project has more than 100 tests."
