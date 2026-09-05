/**
 * Netlify Function: generate.js
 * Menggunakan format Standard Netlify / AWS Lambda Handler (CommonJS)
 * Dijamin 100% serasi tanpa sebarang isu ESM / Module Scope.
 */

exports.handler = async (event, context) => {
  // Benarkan kaedah POST sahaja
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Sila gunakan kaedah POST.' })
    };
  }

  let requestData;
  try {
    requestData = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Format JSON permintaan tidak sah.' })
    };
  }

  const { prompt, systemInstruction, isJson } = requestData;

  if (!prompt) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Arahan prompt tidak dibekalkan.' })
    };
  }

  // Ambil API Key dari Netlify Environment variables
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'GEMINI_API_KEY belum dimasukkan di Netlify. Sila ke Site configuration > Environment variables.'
      })
    };
  }

  // Senarai model rasmi Google terkini
  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
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

  // Cuba setiap model sehingga berjaya
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
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: candidateText })
            };
          }
        } else {
          const errText = await fetchResponse.text();
          lastErrorMessage = errText;

          // Jika Google sibuk / rate limit, jeda sebentar dan cuba lagi
          if (fetchResponse.status === 503 || fetchResponse.status === 429) {
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          // Jika model tidak disokong, beralih ke model seterusnya
          break;
        }
      } catch (netErr) {
        lastErrorMessage = netErr.message;
      }
    }
  }

  let cleanMsg = lastErrorMessage;
  try {
    const j = JSON.parse(lastErrorMessage);
    cleanMsg = j.error?.message || lastErrorMessage;
  } catch (_) {}

  return {
    statusCode: 502,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: `[Google Gemini API]: ${cleanMsg}` })
  };
};
