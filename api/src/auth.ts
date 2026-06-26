import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import * as JWT from "jose";
import { z } from "zod";
import type * as Account from "./account";
import { accountIdSchema } from "./client";
import type { RuntimeEnv } from "./config";
import type RootContext from "./context";

const PASSWORD_ALGORITHM = "PBKDF2";
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_HASH_ALGORITHM = "SHA-256";
const PASSWORD_KEY_LENGTH_BITS = 256;

const localLoginSchema = z.object({
	email: z.string().check(z.email()),
	password: z.string().check(z.minLength(8), z.maxLength(256)),
});

const localRegisterSchema = localLoginSchema.extend({
	name: z.string().check(z.minLength(4), z.maxLength(100)),
});

export type AuthResponse = {
	token: string;
	account: Account.Info;
};

// Use ZOD to validate the payload
const tokenSchema = z.object({
	sub: accountIdSchema,
	exp: z.number(),
	iat: z.number(),
});

export type Token = z.infer<typeof tokenSchema>;

export class Context {
	#secretKey: Uint8Array;

	constructor(env: RuntimeEnv) {
		this.#secretKey = new TextEncoder().encode(env.AUTH_SECRET);
	}

	async create(userId: string, expiresIn: number = 365 * 24 * 60 * 60): Promise<string> {
		const now = Math.floor(Date.now() / 1000);

		return await new JWT.SignJWT({
			sub: userId,
			iat: now,
			exp: now + expiresIn,
		})
			.setProtectedHeader({ alg: "HS256" })
			.sign(this.#secretKey);
	}

	async verify(token: string): Promise<Token | undefined> {
		const { payload } = await JWT.jwtVerify(token, this.#secretKey);
		const parsed = tokenSchema.safeParse(payload);
		if (!parsed.success) {
			console.warn("failed to verify token", parsed.error);
			return;
		}

		return parsed.data;
	}
}

export const router = new Hono<{
	Bindings: RuntimeEnv;
	Variables: {
		ctx: RootContext;
	};
}>()
	.post("/register", zValidator("json", localRegisterSchema), async (c) => {
		const body = c.req.valid("json");
		const email = normalizeEmail(body.email);
		const ctx = c.var.ctx;

		const existing = await ctx.account.getByEmail(email);
		if (existing) {
			return c.json({ error: "Account already exists" }, 409);
		}

		const account = await ctx.account.create({
			email,
			name: body.name,
			passwordHash: await hashPassword(body.password),
		});
		const token = await ctx.auth.create(account.id);

		return c.json({ token, account } satisfies AuthResponse, 201);
	})
	.post("/login", zValidator("json", localLoginSchema), async (c) => {
		const body = c.req.valid("json");
		const email = normalizeEmail(body.email);
		const ctx = c.var.ctx;

		const auth = await ctx.account.getLocalAuthByEmail(email);
		if (!auth || !(await verifyPassword(body.password, auth.passwordHash))) {
			return c.json({ error: "Invalid email or password" }, 401);
		}

		const account = await ctx.account.get(auth.id);
		if (!account) {
			return c.json({ error: "Account not found" }, 404);
		}

		const token = await ctx.auth.create(account.id);
		return c.json({ token, account } satisfies AuthResponse, 200);
	});

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);

	const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
	return ["pbkdf2-sha256", PASSWORD_ITERATIONS.toString(), base64UrlEncode(salt), base64UrlEncode(derived)].join("$");
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
	const [algorithm, iterationsRaw, saltRaw, expectedRaw] = encoded.split("$");
	if (algorithm !== "pbkdf2-sha256" || !iterationsRaw || !saltRaw || !expectedRaw) {
		return false;
	}

	const iterations = Number.parseInt(iterationsRaw, 10);
	if (!Number.isSafeInteger(iterations) || iterations <= 0) {
		return false;
	}

	const salt = base64UrlDecode(saltRaw);
	const expected = base64UrlDecode(expectedRaw);
	const actual = await derivePassword(password, salt, iterations);

	return constantTimeEqual(actual, expected);
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), PASSWORD_ALGORITHM, false, [
		"deriveBits",
	]);
	const saltBuffer = new ArrayBuffer(salt.byteLength);
	new Uint8Array(saltBuffer).set(salt);
	const bits = await crypto.subtle.deriveBits(
		{
			name: PASSWORD_ALGORITHM,
			hash: PASSWORD_HASH_ALGORITHM,
			salt: saltBuffer,
			iterations,
		},
		key,
		PASSWORD_KEY_LENGTH_BITS,
	);

	return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;

	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	}
	return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
	const binary = String.fromCharCode(...bytes);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
	const padded = value
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export const required = createMiddleware<{
	Bindings: RuntimeEnv;
	Variables: {
		account_id: Account.Id;
		ctx: RootContext;
	};
}>(async (c, next) => {
	const token = c.req.header("Authorization")?.replace(/^Bearer\s+/, "");
	if (!token) return c.text("Unauthorized", 401);

	const user = await c.var.ctx.auth.verify(token);
	if (!user) return c.text("Unauthorized", 401);

	c.set("account_id", user.sub);
	return await next();
});

export const optional = createMiddleware<{
	Bindings: RuntimeEnv;
	Variables: {
		account_id?: Account.Id;
		ctx: RootContext;
	};
}>(async (c, next) => {
	const token = c.req.header("Authorization")?.replace(/^Bearer\s+/, "");
	if (!token) return await next();

	const user = await c.var.ctx.auth.verify(token);
	if (!user) return await next();

	c.set("account_id", user.sub);
	return await next();
});
