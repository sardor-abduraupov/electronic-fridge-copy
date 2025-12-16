export async function onRequest(context: any) {
  const { request, env } = context;
  return env.JSONBLOB_WORKER.fetch(request);
}