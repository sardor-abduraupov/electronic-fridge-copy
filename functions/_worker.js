export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/jsonblob")) {
      return env.JSONBLOB_WORKER.fetch(request);
    }

    return fetch(request);
  }
};