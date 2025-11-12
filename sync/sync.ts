/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ReadonlyJSONValue,
  ReadTransaction,
  WriteTransaction,
} from "replicache";

/**
 * Remote transaction interface that users must implement
 * Contains replicache protocol methods (client, client group, CVR management)
 * Users extend this with their own properties/methods (db, userId, etc.)
 */
export interface RemoteTransaction {
  getClient(clientId: string): Promise<Client | null>;
  getClients(clientIds: string[]): Promise<Client[]>;
  updateClient(client: Client): Promise<void>;
  updateClients(clients: Client[]): Promise<void>;

  getClientGroup(clientGroupId: string): Promise<ClientGroup | null>;
  updateClientGroup(clientGroup: ClientGroup): Promise<void>;
  getClientsInClientGroup(clientGroupId: string): Promise<Client[]>;

  batchGetCVR(clientGroupId: string, keys: string[]): Promise<CVR[]>;
  batchSetCVR(clientGroupId: string, entries: CVR[]): Promise<void>;
}

export type Client = {
  id: string;
  clientGroupId: string;
  lastMutationId: number;
  lastModified: Date;
};

export type ClientGroup = {
  id: string;
  cvrVersion: number;
  lastModified: Date;
};

export type CVR = {
  clientGroupId: string;
  key: string;
  version: number;
  syncSequence: number;
};

export type Entry<Value = ReadonlyJSONValue> = {
  key: string;
  version: number;
  value: Value;
  deleted: boolean;
};

/**
 * Query definition - both local and remote implementations
 * Local runs in Replicache (client-side), Remote runs on server
 */
type QueryDef<TX extends RemoteTransaction, Params, Item> = {
  local: (tx: ReadTransaction, params: Params) => Promise<Item[]>;
  remote: (tx: TX, params: NoInfer<Params>) => Promise<Entry<NoInfer<Item>>[]>;
};

/**
 * Mutation definition - both local and remote implementations
 */
type MutationDef<TX extends RemoteTransaction, Params> = {
  local: (tx: WriteTransaction, params: Params) => Promise<void>;
  remote: (tx: TX, params: NoInfer<Params>) => Promise<void>;
};

/**
 * Query builder - helps capture types for a single query
 * Usage: q<Params, Item>({ local, remote })
 */
type QueryBuilder<TX extends RemoteTransaction> = <
  Params = unknown,
  Item = unknown
>(
  def: QueryDef<TX, Params, Item>
) => QueryDef<TX, Params, Item>;

/**
 * Mutation builder - helps capture types for a single mutation
 * Usage: m<Params>({ local, remote })
 */
type MutationBuilder<TX extends RemoteTransaction> = <Params = unknown>(
  def: MutationDef<TX, Params>
) => MutationDef<TX, Params>;

/**
 * The sync definition returned by defineSync
 */
export type Sync<
  TX extends RemoteTransaction,
  Queries extends Record<string, QueryDef<TX, any, any>>,
  Mutations extends Record<string, MutationDef<TX, any>>
> = {
  schemaVersion: number;
  cvrStrategy: "auto" | "manual";
  queries: Queries;
  mutations: Mutations;
};

/**
 * Defines a sync engine with typed queries and mutations
 *
 * @example
 * ```ts
 * interface MyTransaction extends RemoteTransaction {
 *   db: Database
 *   userId: string
 *   // ... implement all required RemoteTransaction methods
 * }
 *
 * const sync = defineSync<MyTransaction>()({
 *   version: '1.0.0',
 *   queries: (q) => ({
 *     getNodes: q<{ type: string }, BlockNode>({
 *       local: async (tx, params) => {
 *         const nodes = []
 *         for await (const [key, value] of tx.scan({ prefix: `nodes/${params.type}/` })) {
 *           nodes.push(value)
 *         }
 *         return nodes
 *       },
 *       remote: async (tx, params) => {
 *         const nodes = await tx.db.query('SELECT * FROM nodes WHERE type = $1', [params.type])
 *         return nodes.map(n => ({ key: n.id, version: n.updatedAt, value: n }))
 *       }
 *     })
 *   }),
 *   mutations: (m) => ({
 *     updateNode: m<{ id: string; data: any }>({
 *       local: async (tx, params) => {
 *         await tx.set(`node/${params.id}`, params.data)
 *       },
 *       remote: async (tx, params) => {
 *         await tx.db.query('UPDATE nodes SET data = $1 WHERE id = $2', [params.data, params.id])
 *       }
 *     })
 *   })
 * })
 * ```
 */
export function defineSync<TX extends RemoteTransaction>() {
  return <
    Queries extends Record<string, QueryDef<TX, any, any>>,
    Mutations extends Record<string, MutationDef<TX, any>>
  >(config: {
    schemaVersion: number;
    cvrStrategy?: "auto" | "manual";
    queries: (q: QueryBuilder<TX>) => Queries;
    mutations: (m: MutationBuilder<TX>) => Mutations;
  }): Sync<TX, Queries, Mutations> => {
    const query: QueryBuilder<TX> = (def) => def;
    const mutation: MutationBuilder<TX> = (def) => def;

    return {
      schemaVersion: config.schemaVersion,
      cvrStrategy: config.cvrStrategy ?? "auto",
      queries: config.queries(query),
      mutations: config.mutations(mutation),
    };
  };
}
