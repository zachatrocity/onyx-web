// The `type` keyword is VERY important here
import type * as Api from "@hang/api";
import { hc } from "hono/client";

export type * from "@hang/api";
export * from "@hang/api/client";

import { Effect, Signal } from "@moq/signals";
import { API_URL } from "./config";
import Settings from "./settings";

export class Client {
	// TODO Make two separate routes for authenticated and unauthenticated.
	routes: ReturnType<typeof hc<Api.App>>;

	#authenticated: Signal<boolean>;

	signals = new Effect();

	constructor() {
		const token = Settings.auth.token.peek();

		this.#authenticated = new Signal(!!token);
		const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
		this.routes = hc<Api.App>(API_URL, { headers });

		this.signals.effect((effect: Effect) => {
			// TODO async verify the token is valid
			const token = effect.get(Settings.auth.token);
			this.#authenticated.set(!!token);

			// Annoying duplication, but I don't want to leave this.routes uninitialized.
			const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
			this.routes = hc<Api.App>(API_URL, { headers });
		});

		this.signals.effect((effect) => {
			const authenticated = effect.get(this.#authenticated);
			if (!authenticated) return;

			effect.spawn(async () => {
				const response = await this.routes.account.info.$get();
				if (!response.ok) {
					console.error(`Failed to get info: ${response.statusText}`);
					return;
				}

				const info = await response.json();
				Settings.account.name.set(info.name);
				Settings.account.avatar.set(info.avatar);
			});
		});
	}

	get authenticated(): Signal<boolean> {
		return this.#authenticated;
	}

	async login(email: string, password: string): Promise<void> {
		const response = await this.routes.auth.login.$post({
			json: { email, password },
		});

		if (!response.ok) {
			throw new Error(await authError(response));
		}

		const data = await response.json();
		Settings.auth.token.set(data.token);
	}

	async register(name: string, email: string, password: string): Promise<void> {
		const response = await this.routes.auth.register.$post({
			json: { name, email, password },
		});

		if (!response.ok) {
			throw new Error(await authError(response));
		}

		const data = await response.json();
		Settings.auth.token.set(data.token);
	}

	async logout(): Promise<void> {
		Settings.clear();
	}
}

export const client = new Client();

async function authError(response: Response): Promise<string> {
	const data = await response.json().catch(() => undefined);
	if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
		return data.error;
	}
	return `Authentication failed: ${response.statusText}`;
}
