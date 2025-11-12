/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  dropAllDatabases,
  dropDatabase,
  type PullResponseV1,
  Replicache,
} from "replicache";
import type { PullBody } from "../pull";
import type { Mutation } from "../push";
import type { RemoteTransaction, Sync } from "../sync";

export const syncClient = <
  TX extends RemoteTransaction,
  Queries extends Record<string, any>,
  Mutations extends Record<string, any>
>({
  name,
  sync,
  pullURL,
  pushURL,
  maxPayloadSize = 4_400_000, // ~4.4MB, a tad lower than vercel's limit
}: {
  name: string;
  pullURL: string;
  pushURL: string;
  sync: Sync<TX, Queries, Mutations>;
  maxPayloadSize?: number | false;
}) => {
  const activeQueries: NonNullable<PullBody["queries"]> = {};

  const replicache = new Replicache({
    name,
    mutators: sync.mutations,
    puller: async (requestBody) => {
      try {
        const raw = await fetch(pullURL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...requestBody, queries: activeQueries }),
        });

        const erroredRequest =
          Boolean(raw.status.toString().startsWith("2")) === false;

        const response = (await raw.json()) as PullResponseV1 & {
          error?: string;
        };

        if (response.error === "ClientStateNotFound") {
          await dropDatabase(replicache.idbName);
          window.location.reload();
          throw new Error("ClientStateNotFound");
        }

        if (response.error === "VersionNotSupported") {
          await dropAllDatabases();
          window.location.reload();
          throw new Error("VersionNotSupported");
        }

        return {
          httpRequestInfo: {
            httpStatusCode: raw.status,
            errorMessage: erroredRequest ? raw.statusText : "",
          },
          response,
        };
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: doing this cause replicache try-catches and doesn't log which makes debugging hard
        console.error(error);
        throw error;
      }
    },
    pusher: async (requestBody) => {
      if (requestBody.pushVersion !== 1) {
        throw new Error(
          `replicache push version was expected to be 1, found ${requestBody.pushVersion}`
        );
      }

      const batches =
        maxPayloadSize !== false
          ? requestBody.mutations.reduce<
              Array<{ currentSize: number; mutations: Mutation[] }>
            >(
              (acc, mutation) => {
                const mutationBytesSize = new Blob([
                  JSON.stringify(mutation.args),
                ]).size;
                const currentBatch = acc.at(-1);
                if (!currentBatch) {
                  throw new Error("expected current batch");
                }

                if (mutationBytesSize >= maxPayloadSize) {
                  // biome-ignore lint/suspicious/noConsole: .
                  console.warn(
                    `Mutation ${mutation.name} is too large, skipping.`,
                    {
                      mutationBytesSize,
                      maxPayloadSize,
                    }
                  );
                  currentBatch.mutations.push({
                    ...mutation,
                    skip: true,
                    args: {},
                  });
                  return acc;
                }

                const shouldAddToCurrentBatch =
                  currentBatch.currentSize === 0 ||
                  currentBatch.currentSize + mutationBytesSize < maxPayloadSize;
                if (shouldAddToCurrentBatch) {
                  currentBatch.mutations.push(mutation);
                  currentBatch.currentSize += mutationBytesSize;
                } else {
                  // create new batch
                  acc.push({
                    currentSize: mutationBytesSize,
                    mutations: [mutation],
                  });
                }

                return acc;
              },
              [{ currentSize: 0, mutations: [] }]
            )
          : [{ currentSize: 0, mutations: requestBody.mutations }];

      const requests = await Promise.all(
        batches.map(async (batch) => {
          if (batch.mutations.length === 0) {
            return;
          }
          const resp = await fetch(pushURL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...requestBody,
              mutations: batch.mutations,
            }),
          });

          return resp;
        })
      );

      const erroredRequest = requests.find(
        (r) => Boolean(r?.status.toString().startsWith("2")) === false
      );

      const DEFAULT_HTTP_STATUS_CODE = 200;
      return {
        httpRequestInfo: {
          httpStatusCode: erroredRequest
            ? erroredRequest.status
            : DEFAULT_HTTP_STATUS_CODE,
          errorMessage: erroredRequest ? erroredRequest.statusText : "",
        },
      };
    },
  });

  type QueryNames = keyof Queries;

  const client = {
    mutate: replicache.mutate,
    pendingMutations: replicache.experimentalPendingMutations,
    subscribe: <QName extends QueryNames>(args: {
      query: QName;
      params: Parameters<Queries[QName]["local"]>[1];
      onData: (data: Awaited<ReturnType<Queries[QName]["local"]>>) => void;
    }) => {
      activeQueries[args.query as string] = { params: args.params };

      const unsubscribe = replicache.subscribe(
        async (tx) => {
          const queryDef = sync.queries[args.query];
          const result = await queryDef.local(tx, args.params);
          return result;
        },
        { onData: args.onData }
      );

      replicache.pull();

      return () => {
        delete activeQueries[args.query as string];
        unsubscribe();
      };
    },
    query: async <QName extends QueryNames>(args: {
      query: QName;
      params: Parameters<Queries[QName]["local"]>[1];
    }): Promise<Awaited<ReturnType<Queries[QName]["local"]>>> => {
      activeQueries[args.query as string] = { params: args.params };

      try {
        const queryDef = sync.queries[args.query];
        const result = await replicache.query(async (tx) => {
          return await queryDef.local(tx, args.params);
        });
        await replicache.pull();
        return result;
      } finally {
        delete activeQueries[args.query as string];
      }
    },

    activeQueries,
  };

  return client;
};

export type SyncClient<
  TX extends RemoteTransaction,
  S extends Sync<TX, any, any>
> = ReturnType<typeof syncClient<TX, S["queries"], S["mutations"]>>;
