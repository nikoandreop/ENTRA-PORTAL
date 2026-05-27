import { getDb } from './database.js';

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const db = getDb();
  const result = await db.query(convertPlaceholders(sql), params);
  return (result.rows[0] as T) || null;
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = getDb();
  const result = await db.query(convertPlaceholders(sql), params);
  return result.rows as T[];
}

export async function execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
  const db = getDb();
  const result = await db.query(convertPlaceholders(sql), params);
  return { rowCount: result.rowCount || 0 };
}

export async function queryCount(sql: string, params: any[] = []): Promise<number> {
  const row = await queryOne<{ total: string }>(sql, params);
  return row ? Number(row.total) : 0;
}

function convertPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}
