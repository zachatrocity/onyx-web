import { Catalog } from "@moq/hang";
import type * as Moq from "@moq/lite";
import type * as Publish from "@moq/publish";
import { Effect, Signal } from "@moq/signals";
import { SpeakingSection, TRACK } from "./section";

export class SpeakingPublish {
	// Whether speaking detection is enabled
	enabled: Signal<boolean>;

	// Whether the user is currently speaking
	active: Signal<boolean>;

	#section: Signal<{ track: Catalog.Track } | undefined>;

	signals = new Effect();

	constructor(broadcast: Publish.Broadcast, enabled?: boolean | Signal<boolean>) {
		this.enabled = Signal.from(enabled ?? false);
		this.active = new Signal(false);

		// Register the section and track with the broadcast
		this.#section = broadcast.addSection(SpeakingSection);
		broadcast.addTrack(TRACK, (track, effect) => this.#serve(track, effect));

		// Set the catalog section when enabled
		this.signals.effect((effect) => {
			if (!effect.get(this.enabled)) return;
			effect.set(this.#section, { track: { name: TRACK } });
		});
	}

	#serve(track: Moq.Track, effect: Effect): void {
		const values = effect.getAll([this.enabled, this.active]);
		if (!values) return;
		const [_, active] = values;

		track.writeBool(active);
	}

	close() {
		this.signals.close();
	}
}
