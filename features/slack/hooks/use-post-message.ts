import { useCallback, useState } from "react";
import { postJson, toError } from "@/lib/http/client";

type PostResult = { ts: string; channel: string };

export function usePostMessage<TBody extends object>(url: string) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const post = useCallback(
    async (body: TBody): Promise<PostResult> => {
      setIsPending(true);
      setError(null);
      try {
        const json = await postJson<PostResult>(
          url,
          body,
          "Échec de l'envoi du message.",
        );
        return { ts: json.ts, channel: json.channel };
      } catch (e) {
        const err = toError(e);
        setError(err);
        throw err; // l'appelant peut aussi réagir (vider le champ, etc.)
      } finally {
        setIsPending(false);
      }
    },
    [url],
  );

  return { post, isPending, error };
}
