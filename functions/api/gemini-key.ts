export async function onRequest(context: any) {
  const key = context.env.GEMINI_API_KEY;

  if (!key) {
    return new Response(
      JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ key }),
    { headers: { "Content-Type": "application/json" } }
  );
}