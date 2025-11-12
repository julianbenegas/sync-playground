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

  for (const mutation of body.mutations) {
    const client = clients.find((c) => c.id === mutation.clientID);
    if (!client) {
      throw new Error(`Client ${mutation.clientID} not found`);
    }

    const expectedMutationID = client.lastMutationId + 1;

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

    await tx.updateClient({
      ...client,
      lastMutationId: expectedMutationID,
    });
  }
};
