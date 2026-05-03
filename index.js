const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const VERIFY_TOKEN = "24725684";
const ACCESS_TOKEN = "EAALodUAV6RgBRQ7RZBdPcuyNSJJ9r9YiKWKdJ4zezgxs1HLH4bJEmOZA57g7t3J0euTS4K5DpIOpb7KKQFCynjNXU6mP5dICRR58eVZAiiChf1GO7k0ZALffsmK8fpXys5XIR5Ya913JTQkuL2aqEw57p3e9Bw7SqhNEH5bNBYg0ntB0paQawrD74k28Orno7IVRBNcBZB1oQSXTLAV7mvXbqtn28JGXKrDpQqQupgZAgT1PtnN5qUh4TuVCpklhct0SHLcq4AdC0JKBU8ZBEVZB";
const PHONE_NUMBER_ID = "1066218519907665";
const GEMINI_API_KEY = "AIzaSyCioNfz73XIFst0x5RM1qHAnnBMsKGtLJ8";
const GEMINI_MODEL = "gemini-flash-latest";
const MAX_REPLY_LENGTH = 1000;

function sanitizeForComparison(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeEcho(candidate, original) {
  const cleanCandidate = sanitizeForComparison(candidate);
  const cleanOriginal = sanitizeForComparison(original);

  if (!cleanCandidate || !cleanOriginal) {
    return false;
  }

  return cleanCandidate === cleanOriginal;
}

function normalizeReply(text, userName, msgText) {
  const fallback = `Hola ${userName}, recibí tu mensaje: "${msgText}". Servidor operativo de gemini.`;
  const normalized = (text || fallback).replace(/\s+/g, " ").trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, MAX_REPLY_LENGTH);
}

async function generateReplyWithGemini(userName, msgText) {
  if (!msgText) {
    return {
      source: "fallback",
      text: `Hola ${userName}, no pude leer tu mensaje.`
    };
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "TU_GEMINI_API_KEY_AQUI") {
    return {
      source: "fallback",
      text: `Hola ${userName}, recibí tu mensaje: "${msgText}". Servidor operativo.`
    };
  }

  try {
    const prompt = [
      "Responde en espanol de forma breve, clara y amable.",
      "Eres un asistente conectado a WhatsApp.",
      "No repitas literalmente el mensaje del usuario.",
      `Nombre del usuario: ${userName}`,
      `Mensaje del usuario: ${msgText}`
    ].join("\n");

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 220,
          temperature: 0.7
        }
      },
      {
        timeout: 15000
      }
    );

    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (looksLikeEcho(aiText, msgText)) {
      return {
        source: "fallback",
        text: `Hola ${userName}, soy tu asistente con Gemini. Si quieres, te respondo con mas detalle sobre: "${msgText}".`
      };
    }

    return {
      source: aiText ? "gemini" : "fallback",
      text: normalizeReply(aiText, userName, msgText)
    };
  } catch (error) {
    console.error("Error Gemini:", error.response?.data || error.message);
    return {
      source: "fallback",
      text: `Hola ${userName}, recibí tu mensaje: "${msgText}". No pude consultar la IA en este momento.`
    };
  }
}

app.get("/", (req, res) => res.send("Servidor de Anyelver: STATUS OK con ia"));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (message?.type === "text" && message.text?.body) {
      const from = message.from; 
      const msgText = message.text.body;
      const userName = value.contacts?.[0]?.profile?.name || "Ingeniero";

      console.log(`Mensaje recibido de ${userName} (${from})`);

      try {
        const reply = await generateReplyWithGemini(userName, msgText);
        const replyText = normalizeReply(reply.text, userName, msgText);

        await axios.post(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: replyText }
        }, {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          },
          timeout: 15000
        });
        console.log(`Respuesta enviada (${reply.source}).`);
      } catch (e) { console.error("Error:", e.response?.data || e.message); }
    }

    res.sendStatus(200);
  } else { res.sendStatus(404); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));


