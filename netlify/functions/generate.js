// ... existing code ...
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'GEMINI_API_KEY belum dimasukkan di Netlify. Sila ke Site configuration > Environment variables.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Senarai model rasmi Google terkini (dimulakan dengan gemini-3.6-flash seperti yang disyorkan oleh Google)
  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-2.0-flash'
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

  // Cuba setiap model dalam senarai
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

          // Jika Google sibuk (503 / 429), tunggu sekejap dan cuba semula
          if (fetchResponse.status === 503 || fetchResponse.status === 429) {
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          // Jika 404 / deprecated model, langkau terus ke model seterusnya
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
