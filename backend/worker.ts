type Env = {
  GEMINI_API_KEY?: string;
};

const JSONBLOB_ID = "global-fridge";
const JSONBLOB_API = `https://jsonblob.com/api/jsonBlob/${JSONBLOB_ID}`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: cors(),
      });
    }

    // --- Gemini API key endpoint ---
    if (url.pathname === "/api/gemini-key") {
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
          { status: 500, headers: cors() }
        );
      }

      return new Response(
        JSON.stringify({ key: env.GEMINI_API_KEY }),
        { headers: cors() }
      );
    }

    // --- jsonblob proxy ---
    if (url.pathname === "/jsonblob") {
      // --- READ STATE ---
      if (request.method === "GET") {
        try {
          const res = await fetch(JSONBLOB_API, {
            headers: { Accept: "application/json" },
          });

          if (!res.ok) {
            return new Response("{}", { headers: cors() });
          }

          const text = await res.text();

          try {
            JSON.parse(text);
            return new Response(text, { headers: cors() });
          } catch {
            return new Response("{}", { headers: cors() });
          }
        } catch {
          return new Response("{}", { headers: cors() });
        }
      }

      // --- WRITE STATE ---
      if (request.method === "PUT") {
        try {
          const bodyText = await request.text();

          try {
            JSON.parse(bodyText);
          } catch {
            return new Response(
              JSON.stringify({ ok: false, error: "Invalid JSON" }),
              { headers: cors() }
            );
          }

          const res = await fetch(JSONBLOB_API, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: bodyText,
          });

          return new Response(
            JSON.stringify({ ok: res.ok }),
            { headers: cors() }
          );
        } catch {
          return new Response(
            JSON.stringify({ ok: false }),
            { headers: cors() }
          );
        }
      }

      return new Response("Method Not Allowed", { status: 405, headers: cors() });
    }

    return new Response("Not Found", { status: 404 });
  },
};

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}