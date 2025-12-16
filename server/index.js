import { WebSocketServer } from "ws";
import { createLiveSession } from "./liveSession.js";

const PORT = 8787;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY");
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  console.log("LiveAssistant connected");
  createLiveSession(ws, GEMINI_API_KEY);
});

console.log(`LiveAssistant running on ws://localhost:${PORT}`);