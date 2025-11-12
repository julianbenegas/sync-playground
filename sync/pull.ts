/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ClientID, PatchOperation, ReadonlyJSONValue } from "replicache";
import z from "zod";
import type { CVR, Entry, RemoteTransaction, Sync } from "./sync";

export const pullBodySchema = z.object({
  pullVersion: z.literal(1),
  profileID: z.string(),
  clientGroupID: z.string(),
  cookie: z
    .object({
      order: z.number(),
      schemaVersion: z.number(),
      lastQueriedAt: z.string().optional(),
    })
    .nullable(),
  queries: z.record(z.string(), z.object({ params: z.unknown() })).optional(),
});

export type PullBody = z.infer<typeof pullBodySchema>;

type PullResponse = {
  cookie: ReadonlyJSONValue;
  lastMutationIDChanges: Record<ClientID, number>;
  patch: PatchOperation[];
};

export const pull = async <TX extends RemoteTransaction>({
  sync,
  body,
  tx,
}: {
  sync: Sync<TX, any, any>;
  body: PullBody;
  tx: TX;
}): Promise<PullResponse> => {
  const clientCVRVersion = body.cookie?.order ?? 0;

  const clientGroup = await tx.getClientGroup(body.clientGroupID);
  if (!clientGroup) {
    throw new Error(`Client group ${body.clientGroupID} not found`);
  }

  const clients = await tx.getClientsInClientGroup(body.clientGroupID);

  const patch: PatchOperation[] = [];
  const allResultingEntries: Entry[] = [];
  const touchedKeys = new Set<string>();

  for (const [queryName, { params }] of Object.entries(body.queries ?? {})) {
    const query = sync.queries[queryName];
    if (!query) {
      throw new Error(`Query ${queryName} not found`);
    }

    const entries = await query.remote(tx, params);
    for (const entry of entries) {
      if (touchedKeys.has(entry.key)) {
        continue;
      }
      touchedKeys.add(entry.key);
      allResultingEntries.push(entry);
    }
  }

  const newCVRs: CVR[] = [];
  const nextCVRVersion = Math.max(clientCVRVersion, clientGroup.cvrVersion) + 1;

  if (sync.cvrStrategy === "auto") {
    const allResultingKeys = allResultingEntries.map((e) => e.key);
    const existingCVRs = await tx.batchGetCVR(
      body.clientGroupID,
      allResultingKeys
    );
    const cvrMap = new Map(existingCVRs.map((cvr) => [cvr.key, cvr]));

    for (const entry of allResultingEntries) {
      const cvr = cvrMap.get(entry.key);

      const shouldSend =
        !cvr ||
        cvr.version < entry.version ||
        cvr.syncSequence > clientCVRVersion;

      if (!shouldSend) {
        continue;
      }

      addToPatch(patch, entry);
      newCVRs.push({
        key: entry.key,
        clientGroupId: body.clientGroupID,
        version: entry.version,
        syncSequence: nextCVRVersion,
      });
    }
  } else {
    for (const entry of allResultingEntries) {
      addToPatch(patch, entry);
      newCVRs.push({
        key: entry.key,
        clientGroupId: body.clientGroupID,
        version: entry.version,
        syncSequence: nextCVRVersion,
      });
    }
  }

  const lastMutationIDChanges: Record<ClientID, number> = {};
  for (const client of clients) {
    const curr = client.lastMutationId;
    if (curr > (clientGroup.clientLastMutationIds[client.id] || 0)) {
      lastMutationIDChanges[client.id] = curr;
      clientGroup.clientLastMutationIds[client.id] = curr;
    }
  }

  if (patch.length > 0) {
    await Promise.all([
      tx.setClientGroup({
        ...clientGroup,
        cvrVersion: nextCVRVersion,
      }),
      newCVRs.length > 0 ? tx.batchSetCVR(body.clientGroupID, newCVRs) : null,
    ]);
  }

  return {
    patch,
    lastMutationIDChanges,
    cookie:
      patch.length === 0
        ? body.cookie
        : {
            order: nextCVRVersion,
            schemaVersion: sync.schemaVersion,
            lastQueriedAt: new Date().toISOString(),
          },
  };
};

function addToPatch(patch: PatchOperation[], entry: Entry) {
  if (entry.deleted) {
    patch.push({
      op: "del",
      key: entry.key,
    });
  } else {
    patch.push({
      op: "put",
      key: entry.key,
      value: entry.value,
    });
  }
}
