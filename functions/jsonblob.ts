const JSONBLOB_ID = "global-fridge";
const JSONBLOB_API = `https://jsonblob.com/api/jsonBlob/${JSONBLOB_ID}`;

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function onRequest({ request }: any) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }

  // READ
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

  // WRITE
  if (request.method === "PUT") {
    try {
      const body = await request.text();
      JSON.parse(body);

      const res = await fetch(JSONBLOB_API, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
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

  return new Response("Method Not Allowed", {
    status: 405,
    headers: cors(),
  });
}