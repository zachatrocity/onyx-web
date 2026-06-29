import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import * as Account from "../src/account";
import * as Auth from "../src/auth";
import * as Avatar from "../src/avatar";
import type { RuntimeEnv } from "../src/config";
import * as Database from "../src/database";
import * as Fave from "../src/fave";
import * as Health from "../src/health";
import * as Room from "../src/room";
import * as Storage from "../src/storage";

const env = {
	API_URL: "http://localhost:3000",
	APP_URL: "http://localhost:1420",
	R2_PUBLIC_URL: "http://localhost:3000/public",
	RELAY_URL: "http://localhost:4443",
	RELAY_PREFIX: "demo",
	AUTH_SECRET: "test-auth-secret",
	RELAY_SECRET: "relay-secret",
	DATABASE_PATH: ":memory:",
	PUBLIC_STORAGE_PATH: "/tmp/onyx-test-public",
	PUBLIC: {} as R2Bucket,
	DB: {} as D1Database,
} satisfies RuntimeEnv;

function mount(base: string, router: Hono, ctx: Record<string, unknown>) {
	const app = new Hono();
	app.onError((_error, c) => {
		return c.text("Internal Server Error", 500);
	});
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	return app.route(base, router);
}

function authCtx() {
	return new Auth.Context(env);
}

async function tokenFor(accountId = "account-1") {
	return await authCtx().create(accountId);
}

function bearer(token: string) {
	return { Authorization: `Bearer ${token}` };
}

class FakeBucket {
	objects = new Map<string, Uint8Array>();

	async put(key: string, value: Uint8Array) {
		this.objects.set(key, value);
	}

	async get(key: string) {
		const value = this.objects.get(key);
		if (!value) {
			return null;
		}
		return {
			arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
		};
	}

	async delete(key: string) {
		this.objects.delete(key);
	}
}

describe("health route", () => {
	test("returns the current health response shape", async () => {
		const app = new Hono().route("/health", Health.router);
		const response = await app.request("/health");

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("ok");
		expect(body.version).toBe("0.0.1");
		expect(typeof body.timestamp).toBe("string");
		expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
	});
});

describe("room join route", () => {
	function app() {
		return mount("/room", Room.router, {
			env,
			auth: authCtx(),
			room: {
				sign: async (room: string) => `demo/${room}/?jwt=relay-token`,
			},
		});
	}

	test("creates an anonymous guest path when no account or guest is provided", async () => {
		const response = await app().request("/room/lounge/join", {
			method: "POST",
			body: JSON.stringify({}),
			headers: { "Content-Type": "application/json" },
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.url).toBe("http://localhost:4443/demo/lounge/?jwt=relay-token");
		expect(body.path).toStartWith("guest/");
		expect(body.guest).toBe(body.path);
	});

	test("accepts a caller-provided guest path", async () => {
		const response = await app().request("/room/lounge/join", {
			method: "POST",
			body: JSON.stringify({ guest: "guest/alice" }),
			headers: { "Content-Type": "application/json" },
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.path).toBe("guest/alice");
		expect(body.guest).toBe("guest/alice");
	});

	test("uses the authenticated account id instead of a guest path", async () => {
		const response = await app().request("/room/lounge/join", {
			method: "POST",
			body: JSON.stringify({ guest: "guest/alice" }),
			headers: { "Content-Type": "application/json", ...bearer(await tokenFor("account-1")) },
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.path).toBe("account-1");
		expect(body).not.toHaveProperty("guest");
	});

	test("rejects invalid room names before signing relay URLs", async () => {
		const response = await app().request("/room/bad%20room/join", {
			method: "POST",
			body: JSON.stringify({}),
			headers: { "Content-Type": "application/json" },
		});

		expect(response.status).toBe(400);
	});
});

describe("auth middleware and JWT context", () => {
	test("creates and verifies account tokens", async () => {
		const auth = authCtx();
		const token = await auth.create("account-1", 60);
		const verified = await auth.verify(token);

		expect(verified?.sub).toBe("account-1");
		expect(verified?.exp).toBeGreaterThan(verified?.iat ?? 0);
	});

	test("rejects tokens signed with a different secret", async () => {
		const token = await authCtx().create("account-1");
		const wrongAuth = new Auth.Context({ ...env, AUTH_SECRET: "different-secret" });

		await expect(wrongAuth.verify(token)).rejects.toThrow();
	});

	test("returns 401 when a protected route is missing a bearer token", async () => {
		const response = await mount("/account", Account.router, {
			auth: authCtx(),
			account: { get: async () => undefined },
		}).request("/account/info");

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("Unauthorized");
	});

	test("returns the current 500 response for malformed bearer tokens", async () => {
		const response = await mount("/account", Account.router, {
			auth: authCtx(),
			account: { get: async () => undefined },
		}).request("/account/info", { headers: bearer("not-a-jwt") });

		expect(response.status).toBe(500);
	});
});

describe("local auth routes", () => {
	test("registers a local account and returns a token", async () => {
		const createdAccount = {
			id: "account-1",
			name: "Test User",
			avatar: "https://example.com/avatar.png",
		};
		const app = mount("/auth", Auth.router, {
			auth: { create: async () => "api-token" },
			account: {
				getByEmail: async () => undefined,
				create: async () => createdAccount,
			},
		});

		const response = await app.request("/auth/register", {
			method: "POST",
			body: JSON.stringify({
				name: "Test User",
				email: "PERSON@example.com",
				password: "correct horse battery staple",
			}),
			headers: { "Content-Type": "application/json" },
		});

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ token: "api-token", account: createdAccount });
	});

	test("rejects duplicate local registration", async () => {
		const app = mount("/auth", Auth.router, {
			account: {
				getByEmail: async () => ({ id: "account-1" }),
			},
		});

		const response = await app.request("/auth/register", {
			method: "POST",
			body: JSON.stringify({
				name: "Test User",
				email: "person@example.com",
				password: "correct horse battery staple",
			}),
			headers: { "Content-Type": "application/json" },
		});

		expect(response.status).toBe(409);
	});

	test("logs in an existing local account", async () => {
		const hashApp = mount("/auth", Auth.router, {
			auth: { create: async () => "unused" },
			account: {
				getByEmail: async () => undefined,
				create: async () => ({
					id: "account-1",
					name: "Test User",
					avatar: "https://example.com/avatar.png",
				}),
			},
		});
		const registerResponse = await hashApp.request("/auth/register", {
			method: "POST",
			body: JSON.stringify({
				name: "Test User",
				email: "person@example.com",
				password: "correct horse battery staple",
			}),
			headers: { "Content-Type": "application/json" },
		});
		expect(registerResponse.status).toBe(201);

		const passwordHash = await new Promise<string>((resolve) => {
			const app = mount("/auth", Auth.router, {
				auth: { create: async () => "unused" },
				account: {
					getByEmail: async () => undefined,
					create: async (input: { passwordHash: string }) => {
						resolve(input.passwordHash);
						return {
							id: "account-1",
							name: "Test User",
							avatar: "https://example.com/avatar.png",
						};
					},
				},
			});
			void app.request("/auth/register", {
				method: "POST",
				body: JSON.stringify({
					name: "Test User",
					email: "person@example.com",
					password: "correct horse battery staple",
				}),
				headers: { "Content-Type": "application/json" },
			});
		});

		const account = {
			id: "account-1",
			name: "Test User",
			avatar: "https://example.com/avatar.png",
		};
		const app = mount("/auth", Auth.router, {
			auth: { create: async () => "api-token" },
			account: {
				getLocalAuthByEmail: async () => ({ id: "account-1", passwordHash }),
				get: async () => account,
			},
		});

		const response = await app.request("/auth/login", {
			method: "POST",
			body: JSON.stringify({
				email: "person@example.com",
				password: "correct horse battery staple",
			}),
			headers: { "Content-Type": "application/json" },
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ token: "api-token", account });
	});
});

describe("account routes", () => {
	function app() {
		const account = {
			id: "account-1",
			name: "Test User",
			avatar: "https://example.com/avatar.png",
		};
		const calls = {
			updates: [] as unknown[],
			deletes: [] as string[],
		};
		return {
			calls,
			app: mount("/account", Account.router, {
				auth: authCtx(),
				account: {
					get: async () => account,
					update: async (_id: string, update: unknown) => {
						calls.updates.push(update);
						return { ...account, ...update };
					},
					delete: async (id: string) => {
						calls.deletes.push(id);
					},
				},
			}),
		};
	}

	test("returns account info for an authenticated request", async () => {
		const { app: accountApp } = app();
		const response = await accountApp.request("/account/info", { headers: bearer(await tokenFor("account-1")) });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "account-1",
			name: "Test User",
			avatar: "https://example.com/avatar.png",
		});
	});

	test("updates account info from form data", async () => {
		const { app: accountApp, calls } = app();
		const form = new FormData();
		form.set("name", "Renamed User");
		form.set("avatar", "https://example.com/new.png");

		const response = await accountApp.request("/account/info", {
			method: "PUT",
			body: form,
			headers: bearer(await tokenFor("account-1")),
		});

		expect(response.status).toBe(200);
		expect(calls.updates).toEqual([{ name: "Renamed User", avatar: "https://example.com/new.png" }]);
	});

	test("deletes the authenticated account", async () => {
		const { app: accountApp, calls } = app();
		const response = await accountApp.request("/account/info", {
			method: "DELETE",
			headers: bearer(await tokenFor("account-1")),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(calls.deletes).toEqual(["account-1"]);
	});
});

describe("favorites routes", () => {
	async function app() {
		const db = Database.init({ ...env, DB: undefined, DATABASE_PATH: ":memory:" });
		await db.insert(Account.table).values({
			id: "account-1",
			email: "person@example.com",
			name: "Test User",
			avatar: "avatar.png",
			avatarType: "url",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		return mount("/fave", Fave.router, {
			auth: authCtx(),
			db,
			env,
			room: {
				signPreview: async (rooms: string[]) => `demo/?jwt=preview-${rooms.join(",")}`,
			},
		});
	}

	test("adds, lists, checks, and removes favorites", async () => {
		const token = await tokenFor("account-1");
		const favoriteApp = await app();

		expect(
			await (await favoriteApp.request("/fave/lounge/add", { method: "POST", headers: bearer(token) })).json(),
		).toEqual({ success: true });

		const list = await favoriteApp.request("/fave/all", { headers: bearer(token) });
		expect(list.status).toBe(200);
		expect(await list.json()).toEqual({
			favorites: [{ room: "lounge", created_at: expect.any(Number) }],
			url: "http://localhost:4443/demo/?jwt=preview-lounge",
		});

		expect(await (await favoriteApp.request("/fave/lounge", { headers: bearer(token) })).json()).toEqual({
			is_favorite: true,
		});

		expect(
			await (await favoriteApp.request("/fave/lounge/remove", { method: "POST", headers: bearer(token) })).json(),
		).toEqual({ success: true });

		expect(await (await favoriteApp.request("/fave/lounge", { headers: bearer(token) })).json()).toEqual({
			is_favorite: false,
		});
	});

	test("treats duplicate favorite adds as idempotent success", async () => {
		const token = await tokenFor("account-1");
		const favoriteApp = await app();

		await favoriteApp.request("/fave/lounge/add", { method: "POST", headers: bearer(token) });
		const duplicate = await favoriteApp.request("/fave/lounge/add", { method: "POST", headers: bearer(token) });

		expect(duplicate.status).toBe(200);
		expect(await duplicate.json()).toEqual({ success: true });
	});
});

describe("storage and avatar behavior", () => {
	test("uploads, reads, and deletes public storage objects", async () => {
		const bucket = new FakeBucket();
		const storage = new Storage.Context({ ...env, PUBLIC: bucket as unknown as R2Bucket });
		const key = await storage.upload("avatar", new TextEncoder().encode("avatar-bytes"), "png");

		expect(key).toEndWith(".png");
		expect(new TextDecoder().decode(await storage.get("avatar", key))).toBe("avatar-bytes");

		await storage.delete("avatar", key);
		expect(await storage.get("avatar", key)).toBeNull();
	});

	test("serves and misses avatar objects through the avatar route", async () => {
		const bytes = new TextEncoder().encode("png-bytes");
		const avatarApp = mount("/avatar", Avatar.router, {
			storage: {
				get: async (_folder: string, key: string) => (key === "person.png" ? bytes.buffer : null),
			},
		});

		const found = await avatarApp.request("/avatar/person.png");
		expect(found.status).toBe(200);
		expect(found.headers.get("Content-Type")).toBe("image/png");
		expect(new TextDecoder().decode(await found.arrayBuffer())).toBe("png-bytes");

		const missing = await avatarApp.request("/avatar/missing.png");
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "Avatar not found" });
	});

	test("builds avatar URLs for external and R2 avatar types", () => {
		expect(Avatar.url(env, "url", "https://example.com/avatar.png")).toBe("https://example.com/avatar.png");
		expect(Avatar.url(env, "r2", "person.png")).toBe("http://localhost:3000/public/avatar/person.png");
	});
});
