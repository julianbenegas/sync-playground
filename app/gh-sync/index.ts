import { defineSync } from "@/sync";
import type { Transaction } from "./transaction";

export type PR = {
  id: string;
  title: string;
  number: number;
  updatedAt: string;
};

export type Repo = {
  id: string;
  name: string;
  owner: string;
  description: string | null;
  isPrivate: boolean;
  updatedAt: string;
};

export const sync = defineSync<Transaction>()({
  schemaVersion: 1,
  queries: (q) => ({
    getRepos: q<
      {
        owner: string;
        first: number;
        privacy?: "PUBLIC" | "PRIVATE";
        search?: string;
      },
      Repo
    >({
      local: async (tx, params) => {
        const repos: Repo[] = [];
        for await (const value of tx
          .scan({ prefix: `repo/${params.owner}/` })
          .values()) {
          const repo = value as unknown as Repo;

          // Apply privacy filter
          if (params.privacy === "PUBLIC" && repo.isPrivate) continue;
          if (params.privacy === "PRIVATE" && !repo.isPrivate) continue;

          // Apply search filter
          if (
            params.search &&
            !repo.name.toLowerCase().includes(params.search.toLowerCase()) &&
            !repo.description
              ?.toLowerCase()
              .includes(params.search.toLowerCase())
          ) {
            continue;
          }

          repos.push(repo);
        }

        // Sort by updatedAt (most recent first)
        repos.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return repos;
      },
      remote: async (tx, params) => {
        console.time("gql query get repos");

        // Use GitHub's search API for everything
        const privacyFilter =
          params.privacy === "PUBLIC" ? " is:public" : " is:private";
        const searchTerm = params.search
          ? ` ${params.search} in:name,description`
          : "";
        const searchQuery = `user:${params.owner}${searchTerm}${privacyFilter} sort:updated-desc`;

        const result = await tx.gqlQuery<{
          search: {
            nodes: Array<{
              __typename: string;
              id: string;
              name: string;
              description: string | null;
              createdAt: string;
              updatedAt: string;
              isPrivate: boolean;
              owner: {
                login: string;
              };
            } | null>;
          };
        }>({
          query: `
            query SearchRepos($query: String!, $first: Int!) {
              search(query: $query, type: REPOSITORY, first: $first) {
                nodes {
                  ... on Repository {
                    __typename
                    id
                    name
                    description
                    createdAt
                    updatedAt
                    isPrivate
                    owner {
                      login
                    }
                  }
                }
              }
            }
          `,
          variables: {
            query: searchQuery,
            first: params.first,
          },
        });

        const entries: Array<{
          key: string;
          version: number;
          value: Repo;
          deleted: boolean;
        }> = [];

        for (const node of result.search?.nodes ?? []) {
          if (!node || node.__typename !== "Repository") continue;

          entries.push({
            key: `repo/${params.owner}/${node.id}`,
            version: new Date(node.updatedAt).getTime(),
            value: {
              id: node.id,
              name: node.name,
              owner: node.owner.login,
              description: node.description,
              isPrivate: node.isPrivate,
              updatedAt: node.updatedAt,
            },
            deleted: false,
          });
        }

        console.timeEnd("gql query get repos");
        return entries;
      },
    }),
    getPRs: q<
      { owner: string; name: string; first: number; search?: string },
      PR
    >({
      local: async (tx, params) => {
        const prs: PR[] = [];
        for await (const value of tx
          .scan({ prefix: `pr/${params.owner}/${params.name}/` })
          .values()) {
          const pr = value as unknown as PR;

          // Apply search filter
          if (
            params.search &&
            !pr.title.toLowerCase().includes(params.search.toLowerCase())
          ) {
            continue;
          }

          prs.push(pr);
        }

        // Sort by updatedAt (most recent first)
        prs.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return prs;
      },
      remote: async (tx, params) => {
        console.time("gql query get prs");

        // Use GitHub's search API for everything
        const searchTerm = params.search ? ` ${params.search} in:title` : "";
        const searchQuery = `repo:${params.owner}/${params.name} type:pr${searchTerm} sort:updated-desc`;

        const result = await tx.gqlQuery<{
          search: {
            nodes: Array<{
              __typename: string;
              id: string;
              title: string;
              number: number;
              createdAt: string;
              updatedAt: string;
            } | null>;
          };
        }>({
          query: `
            query SearchPRs($query: String!, $first: Int!) {
              search(query: $query, type: ISSUE, first: $first) {
                nodes {
                  ... on PullRequest {
                    __typename
                    id
                    title
                    number
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          `,
          variables: {
            query: searchQuery,
            first: params.first,
          },
        });

        const entries: Array<{
          key: string;
          version: number;
          value: PR;
          deleted: boolean;
        }> = [];

        for (const node of result.search?.nodes ?? []) {
          if (!node || node.__typename !== "PullRequest") continue;

          entries.push({
            key: `pr/${params.owner}/${params.name}/${node.id}`,
            version: new Date(node.updatedAt).getTime(),
            value: {
              id: node.id,
              title: node.title,
              number: node.number,
              updatedAt: node.updatedAt,
            },
            deleted: false,
          });
        }

        console.timeEnd("gql query get prs");
        return entries;
      },
    }),
  }),
  mutations: (m) => ({
    updatePRTitle: m<
      {
        owner: string;
        name: string;
        prId: string;
        title: string;
      },
      { ok: boolean }
    >({
      local: async (tx, params) => {
        const key = `pr/${params.owner}/${params.name}/${params.prId}`;
        const existing = await tx.get(key);
        if (!existing) return { ok: false };

        const pr = existing as unknown as PR;
        await tx.set(key, {
          ...pr,
          title: params.title,
        });
        return { ok: true };
      },
      remote: async (tx, params) => {
        // Update PR title via GitHub API
        await tx.gqlQuery({
          query: `
            mutation UpdatePullRequest($prId: ID!, $title: String!) {
              updatePullRequest(input: { pullRequestId: $prId, title: $title }) {
                pullRequest {
                  id
                  title
                }
              }
            }
          `,
          variables: {
            prId: params.prId,
            title: params.title,
          },
        });
        return { ok: true };
      },
    }),
  }),
});

export type Sync = typeof sync;
