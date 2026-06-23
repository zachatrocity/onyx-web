import { and, desc, eq } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import * as Account from "./account";
import * as Auth from "./auth";
import * as Room from "./room";
import * as rpc from "./rpc";

export interface Info {
	room: string;
	created_at: number;
}

export const table = sqliteTable(
	"favorites",
	{
		accountId: text("account_id")
			.notNull()
			.references(() => Account.table.id, { onDelete: "cascade" }),
		room: text("room").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.room] })],
);

export const router = rpc
	.router()
	// Add a room to favorites
	.post("/:room/add", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;
		const room = c.req.valid("param").room;

		try {
			await ctx.db.insert(table).values({ accountId: account_id, room, createdAt: new Date() });
			return c.json({ success: true });
		} catch (error) {
			// If it's a unique constraint error, that's fine - already favorited
			if (error instanceof Error && error.message.includes("UNIQUE")) {
				return c.json({ success: true });
			}
			throw error;
		}
	})
	// Remove a room from favorites
	.post("/:room/remove", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;
		const room = c.req.valid("param").room;

		await ctx.db.delete(table).where(and(eq(table.accountId, account_id), eq(table.room, room)));
		return c.json({ success: true });
	})
	// Get all favorited rooms
	.get("/all", Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;

		const result = await ctx.db
			.select({ room: table.room, createdAt: table.createdAt })
			.from(table)
			.where(eq(table.accountId, account_id))
			.orderBy(desc(table.createdAt));

		const favorites: Info[] = result.map((row: { room: string; createdAt: Date }) => ({
			room: row.room,
			created_at: row.createdAt.getTime(),
		}));

		// Generate a token that allows subscribing to all favorited rooms
		const token = await ctx.room.signPreview(favorites.map((f) => f.room));
		const url = new URL(token, ctx.env.RELAY_URL);

		return c.json({ favorites, url });
	})
	// Check if a room is favorited
	.get("/:room", rpc.withParam(z.object({ room: Room.nameSchema })), Auth.required, async (c) => {
		const ctx = c.var.ctx;
		const account_id = c.var.account_id;
		const room = c.req.valid("param").room;

		const result = await ctx.db
			.select({ room: table.room })
			.from(table)
			.where(and(eq(table.accountId, account_id), eq(table.room, room)))
			.limit(1);

		return c.json({ is_favorite: result.length > 0 });
	});
