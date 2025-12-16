import { streamGemini } from "./gemini.js";
import { handleToolCall } from "./tools.js";
import { synthesizeSpeech } from "./tts.js";

export function createLiveSession(ws, apiKey) {
  let conversation = [];
  let spokenBuffer = "";

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "user") {
      conversation.push({
        role: "user",
        parts: [{ text: msg.text }]
      });

      await streamGemini({
        apiKey,
        messages: conversation,
        onChunk: async (chunk) => {
          ws.send(JSON.stringify({
            type: "delta",
            text: chunk
          }));

          spokenBuffer += chunk;

          // Speak on sentence boundary
          if (/[.!?]\s*$/.test(spokenBuffer)) {
            try {
              const audioBase64 = await synthesizeSpeech({
                apiKey,
                text: spokenBuffer
              });

              ws.send(JSON.stringify({
                type: "audio",
                audio: audioBase64,
                mimeType: "audio/mp3"
              }));

              spokenBuffer = "";
            } catch (e) {
              ws.send(JSON.stringify({
                type: "error",
                message: "TTS failed"
              }));
            }
          }
        },
        onEnd: async () => {
          if (spokenBuffer.trim()) {
            try {
              const audioBase64 = await synthesizeSpeech({
                apiKey,
                text: spokenBuffer
              });

              ws.send(JSON.stringify({
                type: "audio",
                audio: audioBase64,
                mimeType: "audio/mp3"
              }));
            } catch {}
            spokenBuffer = "";
          }

          ws.send(JSON.stringify({ type: "done" }));
        },
        onError: (err) => {
          ws.send(JSON.stringify({
            type: "error",
            message: err.message
          }));
        }
      });
    }

    if (msg.type === "tool") {
      await handleToolCall(msg.name, msg.args, {
        send: (payload) => ws.send(JSON.stringify(payload))
      });
    }
  });
}