import fetch from "node-fetch";

const TTS_ENDPOINT =
  "https://texttospeech.googleapis.com/v1/text:synthesize";

export async function synthesizeSpeech({ apiKey, text }) {
  const res = await fetch(`${TTS_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: "ru-RU",
        name: "ru-RU-Wavenet-D"
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1.0,
        pitch: 0.0
      }
    })
  });

  if (!res.ok) {
    throw new Error("TTS failed");
  }

  const json = await res.json();
  return json.audioContent; // base64 MP3
}