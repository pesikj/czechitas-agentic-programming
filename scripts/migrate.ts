// Applies database migrations (drizzle/) using the app's own driver; used at container start.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getConfig } from '../src/server/config';

const client = postgres(getConfig().DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
  console.log('Database migrations applied.');
} finally {
  await client.end();
}
