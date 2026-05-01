/**
 * No-op endpoint retained for backwards compatibility.
 * GeoIP now uses MaxMind WebServiceClient (web service mode).
 * Local MMDB download/refresh is no longer needed.
 */
export default defineEventHandler(async (): Promise<{ ok: true }> => {
  return { ok: true }
})
