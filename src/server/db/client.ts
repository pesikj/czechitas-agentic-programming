import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '../config';
import * as schema from './schema';

let instance: ReturnType<typeof createDb> | undefined;

function createDb() {
  return drizzle(postgres(getConfig().DATABASE_URL), { schema });
}

/** Lazily created database connection shared by the server. */
export function getDb() {
  instance ??= createDb();
  return instance;
}
