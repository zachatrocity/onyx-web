import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Api from "../api";

type Mode = "login" | "register";

export default function Login(props: { error?: string; small?: boolean }): JSX.Element {
	const [mode, setMode] = createSignal<Mode>("login");
	const [name, setName] = createSignal("");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | undefined>(props.error);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		setLoading(true);
		setError(undefined);

		try {
			if (mode() === "register") {
				await Api.client.register(name(), email(), password());
			} else {
				await Api.client.login(email(), password());
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setLoading(false);
		}
	};

	return (
		<form class="flex flex-col gap-3 w-full max-w-xs mx-auto text-left" onSubmit={submit}>
			<Show when={error()}>
				<div class="bg-red-500/20 border border-red-400/30 rounded-2xl p-4 text-red-300 text-center">
					{error()}
				</div>
			</Show>

			<Show when={mode() === "register"}>
				<label class="flex flex-col gap-1 text-sm text-white/80">
					Display name
					<input
						type="text"
						autocomplete="name"
						minLength={4}
						maxLength={100}
						required={mode() === "register"}
						value={name()}
						onInput={(event) => setName(event.currentTarget.value)}
						class="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white outline-none focus:border-white/50"
					/>
				</label>
			</Show>

			<label class="flex flex-col gap-1 text-sm text-white/80">
				Email
				<input
					type="email"
					autocomplete="email"
					required
					value={email()}
					onInput={(event) => setEmail(event.currentTarget.value)}
					class="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white outline-none focus:border-white/50"
				/>
			</label>

			<label class="flex flex-col gap-1 text-sm text-white/80">
				Password
				<input
					type="password"
					autocomplete={mode() === "register" ? "new-password" : "current-password"}
					minLength={8}
					required
					value={password()}
					onInput={(event) => setPassword(event.currentTarget.value)}
					class="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white outline-none focus:border-white/50"
				/>
			</label>

			<button
				type="submit"
				disabled={loading()}
				class="flex items-center justify-center p-4 text-white rounded-xl font-medium transition-all bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer leading-none"
			>
				{loading() ? "Working..." : mode() === "register" ? "Create account" : "Sign in"}
			</button>

			<button
				type="button"
				class="text-sm text-white/70 hover:text-white cursor-pointer"
				onClick={() => {
					setError(undefined);
					setMode(mode() === "register" ? "login" : "register");
				}}
			>
				{mode() === "register" ? "Already have an account? Sign in" : "Need an account? Create one"}
			</button>
		</form>
	);
}
