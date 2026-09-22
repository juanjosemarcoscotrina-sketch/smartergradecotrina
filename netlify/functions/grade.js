// netlify/functions/grade.js
//
// Puente seguro entre SmartGrader Pro (frontend) y la API de Claude (Anthropic).
// La API key vive SOLO aquí, como variable de entorno del sitio en Netlify —
// nunca se expone en el navegador del docente.
//
// Configuración requerida en Netlify:
//   Site configuration → Environment variables →
//     ANTHROPIC_API_KEY = sk-ant-...   (obligatoria, desde console.anthropic.com)
//     ANTHROPIC_MODEL   = claude-sonnet-5   (opcional, este es el valor por defecto)
//
// GET  /.netlify/functions/grade  -> { configured: boolean }  (chequeo rápido, sin costo)
// POST /.netlify/functions/grade  -> { prompt, images: [{mediaType, base64}], mode: 'json'|'text' }

exports.handler = async function (event) {
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (event.httpMethod === 'GET') {
    // Chequeo barato de configuración: no llama a Anthropic, no gasta cuota.
    return { statusCode: 200, headers, body: JSON.stringify({ configured: !!apiKey }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ code: 'method_not_allowed', message: 'Método no permitido.' }) };
  }

  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        code: 'not_configured',
        message: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de este sitio de Netlify.',
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ code: 'bad_request', message: 'Cuerpo de la solicitud inválido.' }) };
  }

  const { prompt, images, mode } = payload;
  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ code: 'bad_request', message: 'Falta el prompt.' }) };
  }

  const content = [{ type: 'text', text: prompt }];
  (Array.isArray(images) ? images : []).slice(0, 8).forEach((img) => {
    if (img && img.base64 && img.mediaType) {
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
    }
  });

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        temperature: 0,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      const code = resp.status === 429 ? 'rate_limited' : resp.status === 401 ? 'auth_error' : 'upstream_error';
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ code, message: `La API de Anthropic devolvió un error ${resp.status}.`, detail: detail.slice(0, 500) }),
      };
    }

    const data = await resp.json();
    const text = (data.content || []).map((b) => (b && b.type === 'text' ? b.text : '')).join('');

    if (mode === 'text') {
      return { statusCode: 200, headers, body: JSON.stringify({ text }) };
    }

    const parsed = extractJson(text);
    if (parsed === null) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ code: 'invalid_json', message: 'La IA no devolvió un JSON válido.', raw: text.slice(0, 1000) }),
      };
    }
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ code: 'upstream_error', message: String((err && err.message) || err) }),
    };
  }
};

// Lectura tolerante: el JSON completo, o el contenido de un bloque ```json, o
// el primer { / [ hasta el último } / ] correspondiente.
function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch (e) {}
  }
  const firstCurly = text.indexOf('{');
  const firstSquare = text.indexOf('[');
  let start = -1;
  if (firstCurly >= 0 && (firstSquare < 0 || firstCurly < firstSquare)) start = firstCurly;
  else if (firstSquare >= 0) start = firstSquare;
  if (start >= 0) {
    const lastCurly = text.lastIndexOf('}');
    const lastSquare = text.lastIndexOf(']');
    const end = Math.max(lastCurly, lastSquare);
    if (end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (e) {}
    }
  }
  return null;
}
