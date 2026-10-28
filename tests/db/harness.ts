// Postgres real (PGlite, WASM) con las migraciones del proyecto. Emula lo
// mínimo que Supabase provee: roles anon/authenticated, auth.uid() y el
// esquema storage. Permite probar RLS y funciones SQL sin Docker.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

export interface TestDb {
  db: PGlite;
  /** Ejecuta como usuario autenticado (o anónimo si userId es null). */
  as<T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Ejecuta como superusuario (equivale a service role / consola SQL). */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  createUser(email: string): Promise<string>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = join(root, 'supabase/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      throw new Error(`Falló la migración ${file}: ${(e as Error).message}`);
    }
  }
  await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'));

  // PGlite tiene una sola conexión: las consultas se serializan.
  let queue = Promise.resolve();
  const run = <T>(fn: () => Promise<T>) => {
    const p = queue.then(fn);
    queue = p.then(() => undefined, () => undefined);
    return p;
  };

  return {
    db,
    as: (userId, sql, params = []) => run(async () => {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
      await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
      try {
        return (await db.query(sql, params)).rows as never;
      } finally {
        await db.exec('reset role');
      }
    }),
    admin: (sql, params = []) => run(async () => {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
      return (await db.query(sql, params)).rows as never;
    }),
    createUser: (email) => run(async () => {
      const id = crypto.randomUUID();
      await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
      return id;
    }),
  };
}
