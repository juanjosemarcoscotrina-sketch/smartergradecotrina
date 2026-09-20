# SmartGrader Pro — paquete para Netlify

Este paquete contiene la versión de SmartGrader Pro lista para alojar fuera de
Claude, en tu propio sitio de Netlify.

## Qué cambia respecto a la versión de Claude Artifacts

| Función | En Claude Artifacts | En este paquete (Netlify) |
|---|---|---|
| Calificación por IA de fotos reales | Gratis, con tu cuenta de Claude | Necesita **tu propia API key de Anthropic** (se paga por uso, según [precios de Anthropic](https://www.anthropic.com/pricing)) |
| Descargar examen marcado / CSV / ZIP | Diálogo nativo del visor de Artifacts | Descarga normal del navegador |
| Persistencia del lote | IndexedDB del navegador | Igual — IndexedDB del navegador (sigue siendo local a cada docente/dispositivo) |

## Contenido del paquete

```
index.html                     ← el sitio completo (React + Babel, sin build)
netlify/functions/grade.js     ← función serverless: reenvía fotos a la API de Claude
netlify.toml                   ← configuración de Netlify
README.md                      ← este archivo
```

No hay paso de "build": `index.html` compila su JSX en el navegador con Babel
standalone, cargado desde cdnjs. `netlify/functions/grade.js` no tiene
dependencias npm.

## 1. Consigue una API key de Anthropic

1. Entra a [console.anthropic.com](https://console.anthropic.com) → **API Keys** → **Create Key**.
2. Copia la key (empieza con `sk-ant-...`). Guárdala, no se vuelve a mostrar.
3. Anthropic cobra por uso (revisa sus tarifas); no hay capa gratuita permanente, aunque nuevas cuentas suelen recibir crédito inicial.

## 2. Despliega en Netlify

Las funciones serverless **solo funcionan con un despliegue basado en Git o
por CLI** — el arrastrar-y-soltar del panel web de Netlify NO sube funciones,
solo archivos estáticos. Elige una opción:

### Opción A — GitHub + Netlify (recomendada, sin instalar nada)

1. Crea un repositorio nuevo en GitHub y sube el contenido de esta carpeta (los 4 archivos/carpetas tal cual, manteniendo la ruta `netlify/functions/grade.js`).
2. En [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project** → elige tu repositorio.
3. Deja **Build command** vacío y **Publish directory** en `.` (Netlify detecta `netlify.toml` automáticamente).
4. Antes o después del primer deploy: **Site configuration → Environment variables → Add a variable**:
   - `ANTHROPIC_API_KEY` = tu key de Anthropic
   - (opcional) `ANTHROPIC_MODEL` = `claude-sonnet-5` (o el modelo que prefieras)
5. **Deploy site**. Netlify te da una URL tipo `https://tu-sitio.netlify.app`.

### Opción B — Netlify CLI desde tu computadora

```bash
npm install -g netlify-cli
cd carpeta-descomprimida
netlify login
netlify init            # crea o vincula un sitio
netlify env:set ANTHROPIC_API_KEY "sk-ant-..."
netlify deploy --prod   # sube TODO, incluida la función
```

## 3. Verifica que quedó bien

1. Abre tu sitio publicado.
2. Ve a **IA / Conector** en el menú lateral: debe decir "IA de calificación disponible". Si dice "no disponible", revisa que `ANTHROPIC_API_KEY` esté configurada y vuelve a desplegar (las variables de entorno nuevas necesitan un redeploy para tomar efecto).
3. Pulsa **Probar IA** para una llamada de prueba mínima.
4. En **Captura → Carga por alumno**, sube 1–2 fotos reales de un examen y pulsa **Procesar este alumno con IA**.

## Notas de seguridad

- Tu `ANTHROPIC_API_KEY` vive solo en las variables de entorno de Netlify y solo la usa `netlify/functions/grade.js` en el servidor — nunca llega al navegador del docente.
- La función no guarda fotos ni resultados: cada llamada es independiente (el guardado del lote de exámenes sigue siendo local, en el navegador de cada docente vía IndexedDB, igual que en la versión de Artifacts).
- Si vas a compartir la URL del sitio con otros docentes, cada quien calificará con la misma API key de tu cuenta de Anthropic — el consumo (y el costo) se acumula en una sola cuenta.

## Personalización

- Cambiar de modelo: variable de entorno `ANTHROPIC_MODEL` en Netlify.
- Cambiar a otro proveedor (por ejemplo Gemini): edita `netlify/functions/grade.js` para llamar a `generativelanguage.googleapis.com` en vez de `api.anthropic.com`, ajustando el formato de `content` (Gemini usa `parts` con `inline_data` para imágenes en vez de `content`/`source`).
