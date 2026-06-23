import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle as drizzleBetter } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as Account from "./account";
import type { RuntimeEnv } from "./config";
import * as OAuth from "./oauth";

// biome-ignore lint/suspicious/noExplicitAny: Drizzle's D1, Bun, and better-sqlite3 drivers share runtime APIs but not a useful common static type.
export type Context = any;

export function init(env: RuntimeEnv): Context {
	const schema = { ...OAuth.table, ...Account.table };

	if (env.DB) {
		return drizzleD1(env.DB, { schema });
	}

	if (!env.DATABASE_PATH) {
		throw new Error("DATABASE_PATH is required when DB binding is not configured");
	}

	if (process.versions.bun) {
		return initBunSqlite(env.DATABASE_PATH, schema);
	}

	const sqlite = new Database(env.DATABASE_PATH);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	runMigrations(sqlite);

	return drizzleBetter(sqlite, { schema }) as unknown as Context;
}

function initBunSqlite(path: string, schema: Record<string, unknown>): Context {
	const require = createRequire(import.meta.url);
	const { Database: BunDatabase } = require("bun:sqlite");
	const { drizzle } = require("drizzle-orm/bun-sqlite");
	const sqlite = new BunDatabase(path);

	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	runMigrations(sqlite);

	return drizzle(sqlite, { schema }) as Context;
}

function runMigrations(sqlite: Database.Database) {
	const migrationsDir = new URL("../migrations", import.meta.url).pathname;
	const files = readdirSync(migrationsDir)
		.filter((file) => file.endsWith(".sql"))
		.sort();

	sqlite.exec("CREATE TABLE IF NOT EXISTS __drizzle_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");

	const applied = new Set(
		sqlite
			.prepare("SELECT name FROM __drizzle_migrations")
			.all()
			.map((row) => (row as { name: string }).name),
	);

	for (const file of files) {
		if (applied.has(file)) continue;

		const sql = readFileSync(join(migrationsDir, file), "utf8");
		const insert = sqlite.prepare("INSERT INTO __drizzle_migrations (name, applied_at) VALUES (?, unixepoch())");
		const tx = sqlite.transaction(() => {
			sqlite.exec(sql);
			insert.run(file);
		});
		tx();
	}
}

export default Context;
