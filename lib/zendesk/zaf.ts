let client: ReturnType<Window["ZAFClient"]["init"]> | null = null;

export function getZafClient() {
  if (typeof window === "undefined" || !window.ZAFClient) return null;
  if (!client) client = window.ZAFClient.init();
  return client;
}