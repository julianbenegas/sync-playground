"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { parseAsStringEnum, parseAsString, parseAsInteger, useQueryStates } from "nuqs";
import { useSyncClient } from "./SyncProvider";
import type { Repo } from "@/app/gh-sync";

export function Repos({ owner }: { owner: string }) {
  const client = useSyncClient();
  const [repos, setRepos] = useState<Repo[]>([]);
  
  const [filters, setFilters] = useQueryStates({
    privacy: parseAsStringEnum<"PUBLIC" | "PRIVATE">(["PUBLIC", "PRIVATE"]).withDefault("PRIVATE"),
    search: parseAsString.withDefault(""),
    pageSize: parseAsInteger.withDefault(20),
  });

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.subscribe({
      query: "getRepos",
      params: {
        owner,
        first: filters.pageSize,
        privacy: filters.privacy,
        search: filters.search || undefined,
      },
      onData: (data) => {
        setRepos(data);
      },
    });

    return unsubscribe;
  }, [client, owner, filters.privacy, filters.search, filters.pageSize]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">Repositories for @{owner}</h2>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Privacy Filter */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Privacy:
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters({ privacy: "PRIVATE" })}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                filters.privacy === "PRIVATE"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              Private
            </button>
            <button
              onClick={() => setFilters({ privacy: "PUBLIC" })}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                filters.privacy === "PUBLIC"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              Public
            </button>
          </div>
        </div>

        {/* Page Size */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Show:
          </label>
          <select
            value={filters.pageSize}
            onChange={(e) => setFilters({ pageSize: Number(e.target.value) })}
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
        placeholder="Search repositories..."
        value={filters.search}
        onChange={(e) => setFilters({ search: e.target.value })}
        className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
      />

      {/* Results */}
      {repos.length === 0 ? (
        <p className="text-zinc-500">No repositories found</p>
      ) : (
        <div className="flex flex-col gap-2">
          {repos.map((repo) => {
            // Preserve current filters in the URL when navigating
            const searchParams = new URLSearchParams();
            if (filters.privacy) searchParams.set("privacy", filters.privacy);
            if (filters.search) searchParams.set("search", filters.search);
            if (filters.pageSize !== 20) searchParams.set("pageSize", String(filters.pageSize));
            const queryString = searchParams.toString();
            
            return (
              <Link
                key={repo.id}
                href={`/${repo.owner}/${repo.name}${queryString ? `?${queryString}` : ""}`}
                className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors block"
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">
                    {repo.owner}/{repo.name}
                  </h3>
                  {repo.isPrivate && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                      Private
                    </span>
                  )}
                </div>
                {repo.description && (
                  <p className="text-zinc-600 dark:text-zinc-400 mt-1">
                    {repo.description}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-zinc-500">
        Showing {repos.length}{" "}
        {repos.length === 1 ? "repository" : "repositories"}
      </p>
    </div>
  );
}
