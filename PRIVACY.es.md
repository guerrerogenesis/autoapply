# Sabi – Política de privacidad

*Fecha de entrada en vigor: 12 de noviembre de 2026*

Sabi – Job Forms Helper ("Sabi") es una extensión de navegador que llena formularios de postulación con tu perfil y te ayuda a dar seguimiento a tus postulaciones. Esta política explica qué datos maneja Sabi, dónde se guardan y cuándo salen de tu navegador.

**En resumen: la desarrolladora de Sabi no recopila, recibe, vende ni comparte ninguno de tus datos. Todo se queda en tu navegador, a menos que actives una integración.**

## 1. Datos que Sabi guarda en tu navegador

Sabi guarda estos datos **solo en tu dispositivo**, en el almacenamiento de extensiones de tu navegador (`chrome.storage.local`):

- **Perfil:** nombre, email, teléfono, ciudad, país, links (LinkedIn, GitHub, portafolio), puesto, empresa, años de experiencia, expectativa salarial, disponibilidad, nivel de inglés y resumen.
- **Roles:** las versiones de tu perfil que creas (título, resumen, años, salario, portafolio y palabras clave).
- **Respuestas guardadas** a preguntas abiertas.
- **Historial de postulaciones:** empresa, puesto, URL de la vacante, fecha, status, notas y el rol con el que aplicaste.
- **Ajustes y secretos de las integraciones** que actives (por ejemplo, un token de ClickUp o la URL y el secreto del script de Google Sheets).

Estos datos no se envían a la desarrolladora ni a ningún servidor de la desarrolladora. Sabi no tiene cuentas de usuario, analíticas ni rastreo.

## 2. Tu CV

Cuando usas **Importar desde tu CV**, el archivo (PDF, DOCX o TXT) se lee **dentro de tu navegador**. No se sube a ningún lado y no se guarda: Sabi solo conserva los campos que tú eliges guardar en tu perfil.

## 3. Páginas de vacantes

Sabi solo funciona en una página cuando **tú le das clic** (el permiso `activeTab`). En ese momento:

- lee los campos del formulario de esa página para saber qué llenar;
- lee el título y la URL de la página para sugerir la empresa, el puesto y cuál de tus roles usar;
- llena los campos que tú confirmas, con tu perfil.

Cuando envías una postulación, los datos que pusiste en el formulario van a esa empresa o plataforma de empleo, igual que con cualquier formulario que llenas a mano. Sabi nunca llena campos ocultos y nunca envía tus datos a frames de terceros, como anuncios o widgets.

## 4. Integraciones (solo si las activas)

Todas las integraciones están **apagadas por defecto**. Cuando activas una, Sabi envía **los datos de cada postulación que guardas** (no tu perfil) al servicio que elegiste:

| Integración | Qué se envía | A dónde |
|---|---|---|
| Google Sheets | Fecha, empresa, puesto, perfil (rol con el que aplicaste), status, URL de la vacante, notas, link de ClickUp y un id interno | El Google Apps Script en **tu propia** cuenta de Google |
| ClickUp | Una tarea con empresa, puesto, rol con el que aplicaste, fecha, URL de la vacante y notas | **Tu** espacio de ClickUp (`api.clickup.com`) |
| Webhook | Los datos de la postulación en JSON, firmados con tu secreto | La URL que **tú** escribes |
| Archivo Excel | Tu historial de postulaciones | Un archivo en **tu** carpeta de Descargas (no se envía nada por internet) |

Estos servicios los operan terceros (por ejemplo, Google y ClickUp), y sus propias políticas de privacidad aplican a los datos que les envías. Puedes apagar cualquier integración cuando quieras.

## 5. Permisos

- **storage:** para guardar tus datos en tu navegador.
- **activeTab** y **scripting:** para leer y llenar el formulario de la página donde estás, solo cuando le das clic a Sabi.
- **downloads** (opcional): para guardar el archivo Excel, solo si activas esa integración.
- **Acceso a sitios específicos** (opcional): solo para la integración que activas, por ejemplo `api.clickup.com`, `script.google.com` o la URL de tu webhook.

## 6. Tu control y el borrado de datos

- Puedes editar o borrar tu perfil, roles, respuestas y postulaciones cuando quieras en los ajustes de Sabi.
- **Backup** exporta tus datos como un archivo JSON (los secretos no se incluyen).
- **Al quitar la extensión** se borran todos los datos que Sabi guardó en tu navegador.
- Los datos que enviaste a una integración (por ejemplo, las filas de tu Google Sheet) se quedan en ese servicio hasta que los borres ahí.

## 7. Seguridad

Sabi se diseñó y se auditó para proteger tus datos: solo llena campos visibles, solo funciona en frames de confianza, neutraliza fórmulas de hojas de cálculo, firma los webhooks y valida los archivos que importas. Detalles (en inglés): [SECURITY.md](SECURITY.md).

## 8. Menores

Sabi es una herramienta para personas que buscan empleo y no está dirigida a menores de 13 años.

## 9. Cambios a esta política

Si esta política cambia, la nueva versión se publicará en este archivo con una nueva fecha de entrada en vigor.

## 10. Contacto

Preguntas sobre privacidad: **sabi@geneg.com.mx** · [geneg.com.mx](https://geneg.com.mx)
