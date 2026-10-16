export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Runs a fetch and returns the parsed `{ ok: true, ... }` body, or throws the API's error message. */
export async function fetchJson<T>(
  url: string,
  fallbackMessage: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? fallbackMessage);
  return json as T;
}

export function postJson<T>(
  url: string,
  body: unknown,
  fallbackMessage: string,
): Promise<T> {
  return fetchJson<T>(url, fallbackMessage, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
