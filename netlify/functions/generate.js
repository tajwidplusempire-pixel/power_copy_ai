/**
 * Netlify Function: generate.js
 * Universal Netlify Function dengan Auto-Fallback Model Gemini (2.0-flash, 2.5-flash)
 */

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Sila gunakan kaedah POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let requestData;
  try {
    requestData = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Format JSON permintaan tidak sah.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { prompt, systemInstruction, isJson } = requestData;

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Arahan prompt tidak dibekalkan.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || 
                 process.env.GOOGLE_API_KEY || 
                 process.env.NETLIFY_AI_GATEWAY_KEY || 
                 '';

  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'GEMINI_API_KEY belum dimasukkan di Netlify. Sila ke Site configuration > Environment variables.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Senarai model rasmi Google mengikut turutan keutamaan
  const candidateModels = [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const restPayload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  if (systemInstruction) {
    restPayload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (isJson) {
    restPayload.generationConfig = {
      responseMimeType: 'application/json'
    };
  }

  let lastErrorMessage = '';

  // Cuba setiap model secara automatik jika model sebelumnya tidak dijumpai
  for (const model of candidateModels) {
    try {
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const fetchResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restPayload)
      });

      if (fetchResponse.ok) {
        const jsonResult = await fetchResponse.json();
        const candidateText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;

        if (candidateText) {
          return new Response(JSON.stringify({ text: candidateText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        const errText = await fetchResponse.text();
        lastErrorMessage = errText;
        // Jika ralat 404 (model tidak dijumpai), teruskan gelung untuk cuba model seterusnya
        continue;
      }
    } catch (netErr) {
      lastErrorMessage = netErr.message;
    }
  }

  // Jika semua model gagal
  let cleanMsg = lastErrorMessage;
  try {
    const j = JSON.parse(lastErrorMessage);
    cleanMsg = j.error?.message || lastErrorMessage;
  } catch (_) {}

  return new Response(JSON.stringify({ 
    error: `[Google Gemini API]: ${cleanMsg}` 
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' }
  });
};
