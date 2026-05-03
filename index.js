const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_REPLY_LENGTH = 1000;
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const MENU_MARACUCHO = [
  {
    id: "patacon-pisao",
    nombre: "Patacon Pisao (El Clasico)",
    precio: 9.5,
    descripcion: "Dos tapas de platano frito con pernil, queso de mano, jamon, lechuga y lluvia de salsas.",
    disponibilidad: true
  },
  {
    id: "arepa-cabimera",
    nombre: "Arepa Cabimera",
    precio: 8.5,
    descripcion: "Arepa frita cortada en cuadros con base de carne mechada, huevo cocido, jamon, queso rallado y mucha salsa.",
    disponibilidad: true
  },
  {
    id: "tumbarrancho",
    nombre: "Tumbarrancho",
    precio: 7.5,
    descripcion: "Arepa rebozada y frita, rellena con mortadela, queso, carne y ensalada fresca.",
    disponibilidad: true
  },
  {
    id: "aguita-de-sapo",
    nombre: "Aguita de Sapo",
    precio: 8,
    descripcion: "Arepas pequenas fritas rellenas con pernil y banadas en el jugo de la coccion del pernil con queso frito.",
    disponibilidad: true
  },
  {
    id: "tequenos-gigantes",
    nombre: "Tequenos Gigantes",
    precio: 6.5,
    descripcion: "Dedos de queso version estadio, bien cargados y crujientes.",
    disponibilidad: true
  },
  {
    id: "yoyo-maracucho",
    nombre: "Yoyo Maracucho",
    precio: 6,
    descripcion: "Tajada de platano maduro frito rellena de queso y jamon, rebozada en harina.",
    disponibilidad: true
  },
  {
    id: "mandoca-con-queso",
    nombre: "Mandoca con Queso",
    precio: 5.5,
    descripcion: "Rosquitas de platano maduro y maiz con toque de canela, servidas con queso duro.",
    disponibilidad: true
  },
  {
    id: "hamburguesa-huevo-queso-de-mano",
    nombre: "Hamburguesa con Huevo y Queso de Mano",
    precio: 10,
    descripcion: "Carne artesanal con huevo y queso de mano derretido encima, en pan suave con salsas.",
    disponibilidad: true
  },
  {
    id: "perro-caliente-papitas-queso",
    nombre: "Perro Caliente con Papitas y Queso",
    precio: 7,
    descripcion: "Pan de perro con salchicha, ripio de papa al extremo y queso parmesano.",
    disponibilidad: true
  },
  {
    id: "batido-zapote",
    nombre: "Batido de Zapote",
    precio: 4.5,
    descripcion: "Batido refrescante de zapote ideal para acompanar los platos maracuchos.",
    disponibilidad: true
  }
];

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

function formatForWhatsApp(text) {
  if (!text) return text;
  return text
    .replace(/^[\*\-]\s+/gm, "\u2022 ")        // - item o * item → • item
    .replace(/\*\*(.*?)\*\*/g, "*$1*")          // **bold** → *bold*
    .replace(/#{1,6}\s+(.*)/gm, "*$1*")         // ## Titulo → *Titulo*
    .replace(/\n{3,}/g, "\n\n")                 // máximo dos saltos de línea seguidos
    .trim();
}

function normalizeReply(text, userName, msgText) {
  const fallback = `Hola ${userName}, recibí tu mensaje: "${msgText}". Servidor operativo.`;
  const normalized = (text || fallback).replace(/\s+/g, " ").trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, MAX_REPLY_LENGTH);
}

function isModelNotFoundError(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  return message.includes("404") || message.includes("no se encuentra") || message.includes("not found");
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
      text: `Hola ${userName}, recibí tu mensaje: "${msgText}". Servidor operativo letra.`
    };
  }

  try {
    const menuJson = JSON.stringify(MENU_MARACUCHO, null, 2);

    const systemInstructionText = [
      "Actua como el encargado de ventas de La Esquina Maracucha. Tu personalidad es carismatica y servicial.",
      `Usa este JSON como unica fuente de verdad para precios y productos: ${menuJson}`,
      "Si el cliente pregunta por un ingrediente, buscalo en la descripcion del producto.",
      "FORMATO OBLIGATORIO PARA WHATSAPP (sigue esto al pie de la letra):",
      "- Usa *texto* (un solo asterisco) para resaltar nombres de productos y precios. Ejemplo: *Patacon Pisao* — *$9.50*",
      "- Usa el simbolo • para cada ingrediente o punto de la lista.",
      "- Separa secciones con una linea en blanco.",
      "- NO uses ** (doble asterisco), NO uses # ni ##, NO uses guion - para listas.",
      "- Estructura sugerida cuando presentes un producto:\n  *Nombre del producto* — *$precio*\n  \n  Descripcion breve en una linea.\n  \n  Incluye:\n  • Ingrediente 1\n  • Ingrediente 2\n  \n  Frase vendedora corta al final.",
      "Si el usuario pregunta algo fuera del menu, responde: '¡Esa te la debo, primo! Pero te puedo ofrecer un [PRODUCTO PARECIDO] que esta mundial'.",
      "Respuestas cortas, claras y ordenadas. No repitas literalmente el mensaje del usuario."
    ].join("\n");

    const prompt = [
      `Nombre del cliente: ${userName}`,
      `Consulta del cliente: ${msgText}`,
      "Responde en espanol, corto, claro y vendedor."
    ].join("\n");

    let aiText = "";
    let selectedModel = "";

    for (const modelName of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstructionText
        });

        const result = await model.generateContent(prompt);
        aiText = result.response.text()?.trim() || "";
        selectedModel = modelName;
        break;
      } catch (modelError) {
        if (!isModelNotFoundError(modelError)) {
          throw modelError;
        }
      }
    }

    if (!selectedModel) {
      throw new Error(`No hay modelos Gemini disponibles: ${GEMINI_MODELS.join(", ")}`);
    }

    console.log(`Gemini modelo activo: ${selectedModel}`);

    if (looksLikeEcho(aiText, msgText)) {
      return {
        source: "fallback",
        text: `Hola ${userName}, soy tu asistente con Gemini. Si quieres, te respondo con mas detalle sobre: "${msgText}".`
      };
    }

    return {
      source: aiText ? "gemini" : "fallback",
      text: normalizeReply(formatForWhatsApp(aiText), userName, msgText)
    };
  } catch (error) {
    console.error("Error Gemini:", error.response?.data || error.message);
    return {
      source: "fallback",
      text: `Hola ${userName}, recibí tu mensaje: "${msgText}". No pude consultar la IA en este momento.`
    };
  }
}

app.get("/", (req, res) => res.send("Servidor de Anyelver: STATUS OK"));

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

