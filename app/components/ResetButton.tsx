"use client";

import { useState } from "react";
import { useSyncClient } from "./SyncProvider";

export function ResetButton() {
  const client = useSyncClient();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    if (!client) return;

    const confirmed = window.confirm(
      "Are you sure you want to reset the client? This will clear all local data and reload the page."
    );

    if (!confirmed) return;

    setIsResetting(true);
    await client.reset();
  };

  return (
    <button
      onClick={handleReset}
      disabled={!client || isResetting}
      className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 dark:text-zinc-100 text-sm font-medium transition-colors"
    >
      {isResetting ? "Resetting..." : "Reset Client"}
    </button>
  );
}
