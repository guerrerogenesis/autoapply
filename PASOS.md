# Sabi — Plan por pasos

La versión 1 ya funciona (pasos 1 a 5). Los pasos 6 a 10 son para mejorarla y para que el proyecto luzca en tu portafolio.

## Ya hecho (v0.1)

### Paso 1 · Instalar y probar (15 min)
1. `npm install`, `npm run build`, `npm test` (34 tests).
2. En Chrome: `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → carpeta `dist`.
3. Abre **Profile** y llena tus datos reales. Exporta un backup en la pestaña **Backup**.

### Paso 2 · Pruébala con el formulario demo
`npx serve demo`, abre la página, da clic en la extensión → **Fill this form**. Los campos llenados se marcan en morado.

### Paso 3 · Úsala en vacantes reales
Cada vez que postules:
1. **Fill this form** → revisa los campos (siempre revisa antes de enviar).
2. Escribe las preguntas abiertas que falten.
3. **Save my answers from this page** → la próxima vez se llenan solas.
4. **Save to history** → queda en tu historial con fecha y link.

### Paso 4 · Lleva tu historial
En **Applications** cambia el estado (interview, rejected…) y agrega notas. Exporta a CSV cuando quieras.

### Paso 5 · Sube el repo a GitHub
1. `git init`, primer commit, repo público `autoapply` (puedes renombrarlo a `sabi` en GitHub → Settings).
2. Agrega capturas al README (popup, perfil, formulario llenado).
3. Ponle topics: `chrome-extension`, `typescript`, `manifest-v3`, `job-search`.

## Siguientes pasos

### Paso 6 · Ajustar reglas con formularios reales (1–2 días)
Cuando un campo no se llene, revisa su `label`/`name` con DevTools y agrega un patrón en `src/core/rules.ts` + un caso en `tests/matcher.test.ts`. Este ciclo (bug → test → fix) es muy buena historia para entrevistas.

### Paso 7 · Badge con campos detectados (medio día)
Mostrar en el ícono cuántos campos se pueden llenar. Necesita un service worker y `chrome.action.setBadgeText`.

### Paso 8 · Soporte para Ashby y Workday (1–2 días)
Workday usa componentes propios (dropdowns que no son `<select>`). Buen reto técnico.

### Paso 9 · CI con GitHub Actions (1 hora)
Workflow que corra `npm run typecheck`, `npm test` y `npm run build` en cada push. Agrega el badge al README.

### Paso 10 · Backend opcional en Laravel (2–3 días)
API con Sanctum para sincronizar el historial entre computadoras. Conecta con tu experiencia en Laravel y te da algo full stack para mostrar.

### Extra · Publicar en Chrome Web Store
Cuenta de desarrollador (pago único de USD 5), política de privacidad corta (los datos no salen del navegador) y capturas. Tener una extensión publicada suma mucho al CV.

## Cómo contarlo en entrevistas (inglés sencillo)

> "I was applying to many jobs and I was tired of typing the same information. So I built a Chrome extension with TypeScript. It detects form fields using labels and HTML attributes, and it fills them with my profile. The hard part was making it work with React forms, because they don't see a normal value change. I fixed it with the native value setter and real input events. I also wrote tests with Vitest and jsdom."
