// Helpers to make Hono RPC a little bit easier.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { RuntimeEnv } from "./config";
import Context from "./context";

export function app() {
	return new Hono<{
		Bindings: RuntimeEnv;
	}>()
		.use(withContext)
		.use(withCors);
}

export function router() {
	return new Hono<{
		Bindings: Context;
		Variables: {
			ctx: Context;
		};
	}>();
}

// Instead of exposing env directly, we wrap it in a context object for easier access
export const withContext = createMiddleware<{
	Bindings: RuntimeEnv;
	Variables: {
		ctx: Context;
	};
}>(async (c, next) => {
	const ctx = new Context(c.env);
	c.set("ctx", ctx);
	return await next();
});

export const withCors = createMiddleware<{
	Bindings: RuntimeEnv;
}>(async (c, next) => {
	const corsMiddleware = cors({
		origin: [c.env.APP_URL, "tauri://localhost", "http://tauri.localhost"],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	});

	return corsMiddleware(c, next);
});

export function withForm<T extends z.ZodType>(schema: T) {
	return zValidator("form", schema);
}

export function withJson<T extends z.ZodType>(schema: T) {
	return zValidator("json", schema);
}

export function withQuery<T extends z.ZodType>(schema: T) {
	return zValidator("query", schema);
}

export function withParam<T extends z.ZodType>(schema: T) {
	return zValidator("param", schema);
}
