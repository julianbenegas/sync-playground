"use client";

import { syncClient, type SyncClient } from "@/sync/client/core";
import { sync, type Sync } from "@/app/gh-sync";
import type { Transaction } from "@/app/gh-sync/transaction";
import { createContext, useContext, useState, type ReactNode } from "react";

type SyncContextValue = SyncClient<Transaction, Sync> | null;

const SyncContext = createContext<SyncContextValue>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [client] = useState<SyncContextValue>(() => {
    // Only create the client in the browser (not during SSR)
    if (typeof window === "undefined") {
      return null;
    }
    return syncClient({
      name: "gh-sync",
      pullURL: "/gh-sync/pull",
      pushURL: "/gh-sync/push",
      sync,
    });
  });

  return <SyncContext.Provider value={client}>{children}</SyncContext.Provider>;
}

export function useSyncClient() {
  const context = useContext(SyncContext);
  return context;
}
