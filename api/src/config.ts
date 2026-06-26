import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const urlSchema = z.string().url();
const requiredString = z.string().min(1);

const nodeEnvSchema = z.object({
	API_URL: urlSchema,
	APP_URL: urlSchema,
	GOOGLE_CLIENT_ID: requiredString,
	DISCORD_CLIENT_ID: requiredString,
	R2_PUBLIC_URL: urlSchema,
	RELAY_URL: urlSchema,
	RELAY_PREFIX: requiredString,
	APPLE_CLIENT_ID: requiredString,
	APPLE_TEAM_ID: requiredString,
	APPLE_KEY_ID: requiredString,
	AUTH_SECRET: requiredString,
	GOOGLE_CLIENT_SECRET: requiredString,
	DISCORD_CLIENT_SECRET: requiredString,
	APPLE_CLIENT_SECRET: requiredString,
	RELAY_SECRET: requiredString,
	DATABASE_PATH: requiredString,
	PUBLIC_STORAGE_PATH: requiredString,
	PORT: z.coerce.number().int().positive().default(3000),
});

export type RuntimeEnv = z.infer<typeof nodeEnvSchema> & {
	DB?: D1Database;
	PUBLIC?: R2Bucket;
};

export function loadNodeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
	const parsed = nodeEnvSchema.safeParse(source);
	if (!parsed.success) {
		const messages = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
		throw new Error(`Invalid API configuration:\n${messages.join("\n")}`);
	}

	const env = {
		...parsed.data,
		DATABASE_PATH: resolve(parsed.data.DATABASE_PATH),
		PUBLIC_STORAGE_PATH: resolve(parsed.data.PUBLIC_STORAGE_PATH),
	};

	mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
	mkdirSync(env.PUBLIC_STORAGE_PATH, { recursive: true });

	return env;
}
