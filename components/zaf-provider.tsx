"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getZafClient } from "@/lib/zendesk/zaf";

type ZafClient = NonNullable<ReturnType<typeof getZafClient>>;

const ZafContext = createContext<ZafClient | null>(null);

export function ZafProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<ZafClient | null>(null);

  useEffect(() => {
    const c = getZafClient();
    if (!c) {
      console.error("ZAF SDK failed to load");
      return;
    }
    setClient(c);
  }, []);

  if (!client) return null; // or a loading spinner

  return <ZafContext.Provider value={client}>{children}</ZafContext.Provider>;
}

export function useZaf() {
  const client = useContext(ZafContext);
  if (!client) throw new Error("useZaf must be used inside <ZafProvider>");
  return client;
}