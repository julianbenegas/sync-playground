"use client";

import { useState, useEffect } from "react";
import { useSyncClient } from "./SyncProvider";
import type { PR } from "@/app/gh-sync";

export function PRs({ owner, name }: { owner: string; name: string }) {
  const client = useSyncClient();
  const [prs, setPRs] = useState<PR[]>([]);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.subscribe({
      query: "getPRs",
      params: { owner, name, first: pageSize },
      onData: (data) => {
        setPRs(data);
      },
    });

    return unsubscribe;
  }, [client, owner, name, pageSize]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Pull Requests</h2>

        {/* Page Size */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Show:
          </label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {prs.length === 0 ? (
        <p className="text-zinc-500">No pull requests found</p>
      ) : (
        <div className="flex flex-col gap-2">
          {prs.map((pr) => (
            <div
              key={pr.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">
                  #{pr.number}
                </span>
                <h3 className="font-semibold">{pr.title}</h3>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-zinc-500">
        Showing {prs.length}{" "}
        {prs.length === 1 ? "pull request" : "pull requests"}
      </p>
    </div>
  );
}
