import { defineSync } from "@/sync";
import type { Transaction } from "./transaction";

export type PR = {
  id: string;
  title: string;
  number: number;
};

export type Repo = {
  id: string;
  name: string;
  owner: string;
  description: string | null;
  isPrivate: boolean;
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
        return repos;
      },
      remote: async (tx, params) => {
        console.time("gql query get repos");
        const result = await tx.gqlQuery<{
          user: {
            repositories: {
              nodes: Array<{
                id: string;
                name: string;
                description: string | null;
                updatedAt: string;
                isPrivate: boolean;
                owner: {
                  login: string;
                };
              } | null>;
            };
          } | null;
        }>({
          query: `
            query GetRepos($owner: String!, $first: Int!, $privacy: RepositoryPrivacy) {
              user(login: $owner) {
                repositories(first: $first, privacy: $privacy, orderBy: { field: UPDATED_AT, direction: DESC }) {
                  nodes {
                    id
                    name
                    description
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
            owner: params.owner,
            first: params.first,
            privacy: params.privacy,
          },
        });
        console.timeEnd("gql query get repos");

        const entries: Array<{
          key: string;
          version: number;
          value: Repo;
          deleted: boolean;
        }> = [];

        for (const repo of result.user?.repositories.nodes ?? []) {
          if (!repo) continue;

          // Apply client-side search filter if provided
          if (
            params.search &&
            !repo.name.toLowerCase().includes(params.search.toLowerCase()) &&
            !repo.description
              ?.toLowerCase()
              .includes(params.search.toLowerCase())
          ) {
            continue;
          }

          entries.push({
            key: `repo/${params.owner}/${repo.id}`,
            version: new Date(repo.updatedAt).getTime(),
            value: {
              id: repo.id,
              name: repo.name,
              owner: repo.owner.login,
              description: repo.description,
              isPrivate: repo.isPrivate,
            },
            deleted: false,
          });
        }

        return entries;
      },
    }),
    getPRs: q<{ owner: string; name: string; first: number }, PR>({
      local: async (tx, params) => {
        const prs: PR[] = [];
        for await (const value of tx
          .scan({ prefix: `pr/${params.owner}/${params.name}/` })
          .values()) {
          prs.push(value as unknown as PR);
        }
        return prs;
      },
      remote: async (tx, params) => {
        const result = await tx.gqlQuery<{
          repository: {
            pullRequests: {
              nodes: Array<{
                id: string;
                title: string;
                number: number;
                updatedAt: string;
              } | null>;
            };
          } | null;
        }>({
          query: `
            query GetPRs($owner: String!, $name: String!, $first: Int!) {
              repository(owner: $owner, name: $name) {
                pullRequests(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
                  nodes {
                    id
                    title
                    number
                    updatedAt
                  }
                }
              }
            }
          `,
          variables: {
            owner: params.owner,
            name: params.name,
            first: params.first,
          },
        });

        const entries: Array<{
          key: string;
          version: number;
          value: PR;
          deleted: boolean;
        }> = [];

        for (const pr of result.repository?.pullRequests.nodes ?? []) {
          if (!pr) continue;
          entries.push({
            key: `pr/${params.owner}/${params.name}/${pr.id}`,
            version: new Date(pr.updatedAt).getTime(),
            value: pr,
            deleted: false,
          });
        }

        return entries;
      },
    }),
  }),
  mutations: () => ({}),
});

export type Sync = typeof sync;
