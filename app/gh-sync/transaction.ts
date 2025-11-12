import { RemoteTransaction, Client, ClientGroup, CVR } from "@/sync";
import { createClient as createLibsqlClient } from "@libsql/client";
import { gqlQuery } from "./gql";

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
}

const dbClient = createLibsqlClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export interface Transaction extends RemoteTransaction {
  dbClient: typeof dbClient;
  gqlQuery: typeof gqlQuery;
}

const initDb = async () => {
  await Promise.all([
    dbClient.execute(`
      CREATE TABLE IF NOT EXISTS cvr_entries (
        client_group_id TEXT NOT NULL,
        key TEXT NOT NULL,
        version INTEGER NOT NULL,
        sync_sequence INTEGER NOT NULL,
        PRIMARY KEY (client_group_id, key)
      )
    `),
    dbClient.execute(`
      CREATE INDEX IF NOT EXISTS idx_cvr_client_group 
      ON cvr_entries(client_group_id)
    `),
    dbClient.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        client_group_id TEXT NOT NULL,
        last_mutation_id INTEGER NOT NULL DEFAULT 0,
        last_modified TEXT NOT NULL
      )
    `),
    dbClient.execute(`
      CREATE TABLE IF NOT EXISTS client_groups (
        id TEXT PRIMARY KEY,
        cvr_version INTEGER NOT NULL DEFAULT 0,
        last_modified TEXT NOT NULL
      )
    `),
  ]);
};

let initialized = false;

export const transact = async <T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> => {
  if (!initialized) {
    await initDb();
    initialized = true;
  }

  const dbTx = await dbClient.transaction("write");

  const tx: Transaction = {
    dbClient,
    gqlQuery,
    async getClient(clientId: string): Promise<Client | null> {
      const result = await dbTx.execute({
        sql: "SELECT * FROM clients WHERE id = ?",
        args: [clientId],
      });

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id as string,
        clientGroupId: row.client_group_id as string,
        lastMutationId: Number(row.last_mutation_id),
        lastModified: new Date(row.last_modified as string),
      };
    },

    async getClients(clientIds: string[]): Promise<Client[]> {
      if (clientIds.length === 0) {
        return [];
      }

      const placeholders = clientIds.map(() => "?").join(",");
      const result = await dbTx.execute({
        sql: `SELECT * FROM clients WHERE id IN (${placeholders})`,
        args: clientIds,
      });

      return result.rows.map((row) => ({
        id: row.id as string,
        clientGroupId: row.client_group_id as string,
        lastMutationId: Number(row.last_mutation_id),
        lastModified: new Date(row.last_modified as string),
      }));
    },

    async updateClient(clientData: Client): Promise<void> {
      await dbTx.execute({
        sql: `
          INSERT INTO clients (id, client_group_id, last_mutation_id, last_modified)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            last_mutation_id = excluded.last_mutation_id,
            last_modified = excluded.last_modified
        `,
        args: [
          clientData.id,
          clientData.clientGroupId,
          clientData.lastMutationId,
          clientData.lastModified.toISOString(),
        ],
      });
    },

    async updateClients(clients: Client[]): Promise<void> {
      for (const clientData of clients) {
        await tx.updateClient(clientData);
      }
    },

    async getClientGroup(clientGroupId: string): Promise<ClientGroup | null> {
      const result = await dbTx.execute({
        sql: "SELECT * FROM client_groups WHERE id = ?",
        args: [clientGroupId],
      });

      if (result.rows.length === 0) {
        await dbTx.execute({
          sql: `
            INSERT INTO client_groups (id, cvr_version, last_modified)
            VALUES (?, 0, ?)
          `,
          args: [clientGroupId, new Date().toISOString()],
        });

        return {
          id: clientGroupId,
          cvrVersion: 0,
          lastModified: new Date(),
        };
      }

      const row = result.rows[0];
      return {
        id: row.id as string,
        cvrVersion: Number(row.cvr_version),
        lastModified: new Date(row.last_modified as string),
      };
    },

    async updateClientGroup(clientGroup: ClientGroup): Promise<void> {
      await dbTx.execute({
        sql: `
          UPDATE client_groups
          SET cvr_version = ?, last_modified = ?
          WHERE id = ?
        `,
        args: [
          clientGroup.cvrVersion,
          new Date().toISOString(),
          clientGroup.id,
        ],
      });
    },

    async getClientsInClientGroup(clientGroupId: string): Promise<Client[]> {
      const result = await dbTx.execute({
        sql: "SELECT * FROM clients WHERE client_group_id = ?",
        args: [clientGroupId],
      });

      return result.rows.map((row) => ({
        id: row.id as string,
        clientGroupId: row.client_group_id as string,
        lastMutationId: Number(row.last_mutation_id),
        lastModified: new Date(row.last_modified as string),
      }));
    },

    async batchGetCVR(clientGroupId: string, keys: string[]): Promise<CVR[]> {
      if (keys.length === 0) {
        return [];
      }

      const placeholders = keys.map(() => "?").join(",");
      const result = await dbTx.execute({
        sql: `
          SELECT * FROM cvr_entries
          WHERE client_group_id = ? AND key IN (${placeholders})
        `,
        args: [clientGroupId, ...keys],
      });

      return result.rows.map((row) => ({
        clientGroupId: row.client_group_id as string,
        key: row.key as string,
        version: Number(row.version),
        syncSequence: Number(row.sync_sequence),
      }));
    },

    async batchSetCVR(clientGroupId: string, entries: CVR[]): Promise<void> {
      if (entries.length === 0) {
        return;
      }

      const values = entries.map(() => "(?, ?, ?, ?)").join(", ");

      const args = entries.flatMap((entry) => [
        clientGroupId,
        entry.key,
        entry.version,
        entry.syncSequence,
      ]);

      await dbTx.execute({
        sql: `
          INSERT INTO cvr_entries (client_group_id, key, version, sync_sequence)
          VALUES ${values}
          ON CONFLICT(client_group_id, key) DO UPDATE SET
            version = excluded.version,
            sync_sequence = excluded.sync_sequence
        `,
        args,
      });
    },
  };

  try {
    const result = await fn(tx);
    await dbTx.commit();
    return result;
  } catch (error) {
    await dbTx.rollback();
    throw error;
  }
};
