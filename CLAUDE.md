@AGENTS.md

## Pull requests

Toda PR lleva al final una sección `## 🧪 Cómo probarlo`, escrita para alguien que no ha leído
el código y va a probar en la vista previa de Vercel:

- Primera línea: la URL de la vista previa (la publica el bot de Vercel en la PR; si aún no
  existe, "Preview de Vercel de esta PR") y con qué cuenta entrar y con qué rol. Si hay que
  preparar algo (cambiar un rol, crear una reserva), es el primer paso.
- Pasos numerados, uno por acción, con el sitio exacto (ruta o menú) y lo que **debe** pasar:
  "Debe aparecer…", "No debe…". Primero el caso feliz y luego los "Caso límite".
- Las vistas previas comparten la base de datos de producción (`docs/DESPLIEGUE.md`): si un
  paso cambia datos reales, avísalo y di cómo deshacerlo.
- En "Verificación", di qué se ha probado y qué no (por ejemplo, "no probado en la vista previa").

La plantilla está en `.github/pull_request_template.md`.
