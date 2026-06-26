import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { RuntimeEnv } from "./config";
import * as rpc from "./rpc";

export class Context {
	#bucket?: R2Bucket;
	#root?: string;

	constructor(env: RuntimeEnv) {
		this.#bucket = env.PUBLIC;
		this.#root = env.PUBLIC_STORAGE_PATH;
	}

	async upload(folder: string, file: Uint8Array, extension: string): Promise<string> {
		const key = `${uuidv4()}.${extension}`;
		const fullPath = `${folder}/${key}`;

		if (this.#bucket) {
			await this.#bucket.put(fullPath, file);
		} else {
			const path = this.#path(folder, key);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, file);
		}
		return key;
	}

	async get(folder: string, key: string): Promise<ArrayBuffer | null> {
		const fullPath = `${folder}/${key}`;

		if (this.#bucket) {
			const object = await this.#bucket.get(fullPath);
			if (!object) {
				return null;
			}
			return await object.arrayBuffer();
		}

		try {
			const file = await readFile(this.#path(folder, key));
			return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return null;
			}
			throw error;
		}
	}

	async delete(folder: string, key: string): Promise<void> {
		const fullPath = `${folder}/${key}`;
		if (this.#bucket) {
			await this.#bucket.delete(fullPath);
			return;
		}

		await rm(this.#path(folder, key), { force: true });
	}

	extension(contentType: string): string {
		const extensions: Record<string, string> = {
			"image/jpeg": "jpg",
			"image/png": "png",
			"image/gif": "gif",
			"image/webp": "webp",
			"image/svg+xml": "svg",
		};

		return extensions[contentType] || "jpg";
	}

	#path(folder: string, key: string): string {
		if (!this.#root) {
			throw new Error("PUBLIC_STORAGE_PATH is required when PUBLIC bucket binding is not configured");
		}

		const relative = normalize(join(folder, key));
		if (relative === ".." || relative.startsWith("../")) {
			throw new Error("Invalid storage path");
		}

		return join(this.#root, relative);
	}
}

export function validateAvatar(file: File) {
	const maxSize = 5 * 1024 * 1024; // 5MB
	const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

	if (file.size > maxSize) {
		throw new Error("File size too large. Maximum 5MB allowed.");
	}

	if (!allowedTypes.includes(file.type)) {
		throw new Error("Invalid file type. Only JPEG, PNG, GIF, SVG, and WebP are allowed.");
	}
}

export const router = rpc.router().get(
	"/:folder/:path{.+}",
	rpc.withParam(
		z.object({
			folder: z.string(),
			path: z.string(),
		}),
	),
	async (c) => {
		const { folder, path } = c.req.valid("param");

		const file = await c.var.ctx.storage.get(folder, path);
		if (!file) {
			return c.json({ error: "File not found" }, 404);
		}

		// Determine content type based on file extension
		const extension = path.split(".").pop()?.toLowerCase();
		const contentType = extension
			? {
					jpg: "image/jpeg",
					jpeg: "image/jpeg",
					png: "image/png",
					gif: "image/gif",
					webp: "image/webp",
					svg: "image/svg+xml",
				}[extension] || "application/octet-stream"
			: "application/octet-stream";

		return new Response(file, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=2592000",
			},
		});
	},
);
