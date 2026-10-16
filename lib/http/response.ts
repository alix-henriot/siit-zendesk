export function errorResponse(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ ok: false, error: message }, { status, headers });
}

export function badRequest(message: string): Response {
  return errorResponse(message, 400);
}

export function internalError(): Response {
  return errorResponse("Erreur interne.", 500);
}

export function acknowledge(): Response {
  return new Response(null, { status: 200 });
}
