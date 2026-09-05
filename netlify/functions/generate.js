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
       return new Response(JSON.stringify({ error: 'Format JSON tidak sah.' }), {
         status: 400,
         headers: { 'Content-Type': 'application/json' }
       });
     }

     const { prompt, systemInstruction, isJson } = requestData;

     const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

     if (!apiKey) {
       return new Response(JSON.stringify({
         error: 'GEMINI_API_KEY belum dimasukkan di Netlify Environment Variables.'
       }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
       });
     }

     try {
       const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
         return new Response(JSON.stringify({ error: `[Gemini API Error]: ${errorText}` }), {
           status: fetchResponse.status,
           headers: { 'Content-Type': 'application/json' }
         });
       }

       const jsonResult = await fetchResponse.json();
       const candidateText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;

       return new Response(JSON.stringify({ text: candidateText || '' }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
       });

     } catch (err) {
       return new Response(JSON.stringify({ error: err.message }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
       });
     }
   };
