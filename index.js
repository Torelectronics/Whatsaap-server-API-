const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// --- CONFIGURACIÓN (RECUERDA ACTUALIZAR EL TOKEN CADA 24H) ---
const VERIFY_TOKEN = "24725684"; 
const ACCESS_TOKEN = "EAALodUAV6RgBRQ7RZBdPcuyNSJJ9r9YiKWKdJ4zezgxs1HLH4bJEmOZA57g7t3J0euTS4K5DpIOpb7KKQFCynjNXU6mP5dICRR58eVZAiiChf1GO7k0ZALffsmK8fpXys5XIR5Ya913JTQkuL2aqEw57p3e9Bw7SqhNEH5bNBYg0ntB0paQawrD74k28Orno7IVRBNcBZB1oQSXTLAV7mvXbqtn28JGXKrDpQqQupgZAgT1PtnN5qUh4TuVCpklhct0SHLcq4AdC0JKBU8ZBEVZB"; 
const PHONE_NUMBER_ID = "1066218519907665";

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

    if (message) {
      const from = message.from; 
      const msgText = message.text?.body;
      const userName = value.contacts?.[0]?.profile?.name || "Ingeniero";

      console.log(`Mensaje de ${userName}: ${msgText}`);

      try {
        await axios.post(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: `Hola ${userName}, recibí tu mensaje: "${msgText}". Servidor operativo.` }
        }, {
          headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
        });
        console.log("Respuesta enviada.");
      } catch (e) { console.error("Error:", e.response?.data || e.message); }
    }
    res.sendStatus(200);
  } else { res.sendStatus(404); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
