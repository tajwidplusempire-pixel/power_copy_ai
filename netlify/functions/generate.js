/**
 * Netlify Function: generate.js
 * Dilengkapi Auto-Retry & Multi-Model Pool (Bebas Ralat 'High Demand')
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
                 '';

  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'GEMINI_API_KEY belum dimasukkan di Netlify. Sila ke Site configuration > Environment variables.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Senarai model Google mengikut susunan ketahanan trafik tinggi
  const candidateModels = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
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

  // Cuba setiap model dalam senarai jika satu model sibuk (high demand)
  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
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

          // Jika Google sibuk (503 / 429), tunggu 800ms dan cuba semula atau tukar model
          if (fetchResponse.status === 503 || fetchResponse.status === 429) {
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          // Jika 404 (model tiada), terus langkau ke model seterusnya
          break;
        }
      } catch (netErr) {
        lastErrorMessage = netErr.message;
      }
    }
  }

  // Jika kesemua model gagal selepas dicuba
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
