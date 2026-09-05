/**
 * Netlify Function: generate.js
 * Model: gemini-1.5-flash (Model rasmi Google terpantas & stabil)
 */

export default async (req, context) => {
  // Hanya benarkan kaedah POST
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

  // Ambil API Key dari Netlify Environment variables
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'GEMINI_API_KEY belum dimasukkan di Netlify. Sila ke Site configuration > Environment variables.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Model rasmi Google: gemini-1.5-flash
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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

    const fetchResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(restPayload)
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      let msg = errorText;
      try {
        const j = JSON.parse(errorText);
        msg = j.error?.message || errorText;
      } catch (_) {}

      // Pulangkan status 502 supaya frontend tidak tersilap anggap 404 Netlify
      return new Response(JSON.stringify({ error: `[Google Gemini API]: ${msg}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const jsonResult = await fetchResponse.json();
    const candidateText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return new Response(JSON.stringify({ error: 'Tiada teks dikembalikan oleh model AI.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ text: candidateText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Ralat Function: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
