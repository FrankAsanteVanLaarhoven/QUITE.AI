import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { appConfig } from "@/lib/config";

const globalState = globalThis as unknown as { quietPool?: Pool };

export function getPool(): Pool {
  if (!globalState.quietPool) {
    const url = appConfig().databaseUrl;
    if (!url) throw new Error("DATABASE_URL is not set. Start Postgres and point Quiet at it.");
    globalState.quietPool = new Pool({ connectionString: url, max: 10 });
  }
  return globalState.quietPool;
}

export async function closePool(): Promise<void> {
  await globalState.quietPool?.end();
  globalState.quietPool = undefined;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function micro(value: string | number | bigint | null | undefined): bigint {
  if (value == null) return 0n;
  return BigInt(value);
}

export function nullableMicro(value: string | number | bigint | null | undefined): bigint | null {
  if (value == null) return null;
  return BigInt(value);
}
