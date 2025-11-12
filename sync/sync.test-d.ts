/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ReadTransaction, WriteTransaction } from "replicache";
import { expectTypeOf, test } from "vitest";
import { syncClient } from "./client/core";
import { defineSync, type RemoteTransaction } from "./sync";

interface MyRemoteTransaction extends RemoteTransaction {
  userId: string;
  apiKey: string;
}

test("defineSync types work properly", () => {
  const engine = defineSync<MyRemoteTransaction>()({
    schemaVersion: 1,
    queries: (q) => ({
      getUserById: q<{ hey: string }, { nice: string }>({
        local: async (tx, params) => {
          const ONE_SECOND = 1000;
          await new Promise((resolve) => setTimeout(resolve, ONE_SECOND));

          expectTypeOf(tx).not.toBeAny();
          expectTypeOf(tx).toMatchTypeOf<ReadTransaction>();
          expectTypeOf(params).not.toBeAny();
          expectTypeOf(params).toMatchTypeOf<{ hey: string }>();
          return [{ nice: "yes" }];
        },
        remote: async (tx, params) => {
          const ONE_SECOND = 1000;
          await new Promise((resolve) => setTimeout(resolve, ONE_SECOND));

          expectTypeOf(tx).not.toBeAny();
          expectTypeOf(tx).toMatchTypeOf<MyRemoteTransaction>();
          expectTypeOf(tx.userId).toBeString();
          expectTypeOf(tx.apiKey).toBeString();
          expectTypeOf(params).not.toBeAny();
          expectTypeOf(params).toMatchTypeOf<{ hey: string }>();

          return [
            {
              value: { nice: "another" },
              key: "some",
              version: 123,
              deleted: false,
            },
          ];
        },
      }),
      queryWithInferredTypes: q({
        local: async (_tx, _params) => {
          return [{ some: "thing" }];
        },
        remote: async (_tx, _params) => {
          return [
            {
              key: "something",
              version: 5,
              deleted: false,
              value: { some: "thing" },
            },
          ];
        },
      }),
    }),
    mutations: (m) => ({
      updateUser: m<{ id: string; name: string }>({
        local: async (tx, params) => {
          expectTypeOf(tx).toMatchTypeOf<WriteTransaction>();
          expectTypeOf(params).toMatchTypeOf<{ id: string; name: string }>();
          await tx.set(`user/${params.id}`, { name: params.name });
        },
        remote: async (tx, params) => {
          expectTypeOf(tx).toMatchTypeOf<MyRemoteTransaction>();
          expectTypeOf(params).toMatchTypeOf<{ id: string; name: string }>();
          expectTypeOf(tx.userId).toBeString();
          expectTypeOf(tx.apiKey).toBeString();
        },
      }),
    }),
  });

  expectTypeOf(engine.queries.getUserById.local)
    .parameter(0)
    .toMatchTypeOf<ReadTransaction>();

  expectTypeOf(engine.queries.getUserById.local)
    .parameter(1)
    .toMatchTypeOf<{ hey: string }>();

  expectTypeOf(engine.queries.getUserById.remote)
    .parameter(0)
    .toMatchTypeOf<MyRemoteTransaction>();

  expectTypeOf(engine.queries.getUserById.remote)
    .parameter(1)
    .toMatchTypeOf<{ hey: string }>();

  engine.queries.getUserById
    .local(
      null as unknown as ReadTransaction,
      // @ts-expect-error hey should be a string
      { hey: 1 }
    )
    .then((result) => {
      const item = result[0];
      expectTypeOf(item).not.toBeAny();
      expectTypeOf(item).toMatchTypeOf<{ nice: string } | undefined>();
    });

  engine.queries.getUserById
    .remote(
      null as unknown as MyRemoteTransaction,
      // @ts-expect-error hey should be a string
      { hey: 1 }
    )
    .then((result) => {
      const item = result[0];
      expectTypeOf(item).not.toBeAny();
      expectTypeOf(item?.value).toMatchTypeOf<{ nice: string } | undefined>();
    });

  engine.mutations.updateUser.local(
    null as unknown as WriteTransaction,
    // @ts-expect-error id should be a string
    { id: 123, name: "test" }
  );

  engine.mutations.updateUser.remote(
    null as unknown as MyRemoteTransaction,
    // @ts-expect-error name is missing
    { id: "123" }
  );

  const client = syncClient({
    name: "name",
    pullURL: "/pull",
    pushURL: "/push",
    sync: engine,
  });
  client.subscribe({
    // @ts-expect-error name is missing
    query: "non-existent",
    params: {},
    onData: (data) => {
      expectTypeOf(data).not.toBeAny();
    },
  });
  client.subscribe({
    query: "getUserById",
    // @ts-expect-error incorrect params
    params: {},
    onData: (data) => {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toExtend<{ nice: string }[]>();
    },
  });
});
