/* eslint-disable @typescript-eslint/no-explicit-any */
import z from "zod";
import type { RemoteTransaction, Sync } from "./sync";

const mutationSchema = z.object({
  clientID: z.string(),
  id: z.number(),
  name: z.string(),
  args: z.any(),
  skip: z.boolean().optional(),
});

export type Mutation = z.infer<typeof mutationSchema>;

export const pushBodySchema = z.object({
  pushVersion: z.literal(1),
  profileID: z.string(),
  clientGroupID: z.string(),
  mutations: z.array(mutationSchema),
});

export type PushBody = z.infer<typeof pushBodySchema>;

export const push = async <TX extends RemoteTransaction>({
  sync,
  body,
  tx,
}: {
  sync: Sync<TX, any, any>;
  body: PushBody;
  tx: TX;
}): Promise<void> => {
  const clientIDs = [...new Set(body.mutations.map((m) => m.clientID))];
  const clients = await tx.getClients(clientIDs);
  const lastMutationIDs = Object.fromEntries(
    clientIDs.map((cId) => {
      const client = clients.find((c2) => c2.id === cId);
      return [cId, client?.lastMutationId ?? 0] as const;
    })
  );

  for (const mutation of body.mutations) {
    const lastMutationID = lastMutationIDs[mutation.clientID];
    if (lastMutationID === undefined) {
      throw new Error(
        "invalid state - lastMutationID not found for client: " +
          mutation.clientID
      );
    }

    const expectedMutationID = lastMutationID + 1;

    if (mutation.id < expectedMutationID) {
      continue;
    }
    if (mutation.id > expectedMutationID) {
      break;
    }

    if (!mutation.skip) {
      const mutator = sync.mutations[mutation.name];
      if (!mutator) {
        throw new Error(`Mutation ${mutation.name} not found`);
      }

      await mutator.remote(tx, mutation.args);
    }

    lastMutationIDs[mutation.clientID] = expectedMutationID;
  }

  await tx.batchSetClients(
    Object.entries(lastMutationIDs).map(([clientID, lastMutationID]) => {
      return {
        id: clientID,
        lastMutationId: lastMutationID,
        clientGroupId: body.clientGroupID,
        lastModified: new Date(),
      };
    })
  );
};
