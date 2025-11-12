"use client";

import { useState, useEffect } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useSyncClient } from "./SyncProvider";
import { PRItem } from "./PRItem";
import type { PR } from "@/app/gh-sync";

export function PRs({ owner, name }: { owner: string; name: string }) {
  const client = useSyncClient();
  const [prs, setPRs] = useState<PR[]>([]);

  const [filters, setFilters] = useQueryStates({
    prPageSize: parseAsInteger.withDefault(20),
    prSearch: parseAsString.withDefault(""),
  });

  const handleUpdateTitle = async (prId: string, title: string) => {
    if (!client) return;

    await client.mutate.updatePRTitle({
      owner,
      name,
      prId,
      title,
    });
    client.pull();
  };

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.subscribe({
      query: "getPRs",
      params: {
        owner,
        name,
        first: filters.prPageSize,
        search: filters.prSearch || undefined,
      },
      onData: (data) => {
        setPRs(data);
      },
    });

    return unsubscribe;
  }, [client, owner, name, filters.prPageSize, filters.prSearch]);

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
            value={filters.prPageSize}
            onChange={(e) => setFilters({ prPageSize: Number(e.target.value) })}
            className="px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search pull requests..."
        value={filters.prSearch}
        onChange={(e) => setFilters({ prSearch: e.target.value })}
        className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
      />

      {prs.length === 0 ? (
        <p className="text-zinc-500">No pull requests found</p>
      ) : (
        <div className="flex flex-col gap-2">
          {prs.map((pr) => (
            <PRItem
              key={pr.id}
              pr={pr}
              owner={owner}
              name={name}
              onUpdateTitle={handleUpdateTitle}
            />
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
