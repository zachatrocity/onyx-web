import { Catalog } from "@kixelated/hang";
import { u53 } from "@kixelated/hang/catalog";
import { Effect, Signal } from "@kixelated/signals";
import { Canvas } from "./canvas";
import { Sound } from "./sound";
import { Space } from "./space";

export type FakeBroadcastProps = {
	position?: Catalog.Position;
	user?: Catalog.User;
};

export class FakeBroadcast {
	sound: Sound;

	enabled = new Signal(false);

	location = {
		window: {
			position: new Signal<Catalog.Position | undefined>(undefined),
			handle: new Signal<string | undefined>(undefined),
		},
	};

	chat = {
		message: {
			enabled: new Signal(true),
			latest: new Signal<string | undefined>(undefined),
		},
		typing: {
			enabled: new Signal(true),
			active: new Signal<boolean | undefined>(undefined),
		},
	};

	user = {
		id: new Signal<string | undefined>(undefined),
		name: new Signal<string | undefined>(undefined),
		avatar: new Signal<string | undefined>(undefined),
		color: new Signal<string | undefined>(undefined),
	};

	audio = {
		root: new Signal<AudioNode | undefined>(undefined),
		captions: {
			enabled: new Signal(true),
			text: new Signal<string | undefined>(undefined),
		},
		speaking: {
			enabled: new Signal(false),
			active: new Signal<boolean | undefined>(undefined),
		},
	};

	video = {
		frame: new Signal<VideoFrame | undefined>(undefined),
		catalog: new Signal<Catalog.Video[] | undefined>(undefined),
		detection: {
			enabled: new Signal(false),
			objects: new Signal<Catalog.DetectionObjects | undefined>(undefined),
		},
	};

	signals = new Effect();

	#video?: HTMLVideoElement;

	constructor(sound: Sound, props?: FakeBroadcastProps) {
		this.sound = sound;

		this.user.id.set(props?.user?.id);
		this.user.name.set(props?.user?.name);
		this.user.avatar.set(props?.user?.avatar);
		this.user.color.set(props?.user?.color);

		this.location.window.position.set(props?.position);
		this.location.window.handle.set(Math.random().toString(36).substring(2, 15));

		this.signals.effect((effect) => {
			const message = effect.get(this.chat.message.latest);
			if (!message) return;

			effect.timer(() => this.chat.message.latest.set(undefined), 10000);
		});

		this.signals.effect((effect) => {
			const caption = effect.get(this.audio.captions.text);
			if (!caption) return;

			effect.timer(() => this.audio.captions.text.set(undefined), 10000);
		});

		// A helper to automatically unset the typing indicator when the message is sent.
		this.signals.effect((effect) => {
			const message = effect.get(this.chat.message.latest);
			if (message) this.chat.typing.active.set(false);
		});
	}

	// Plays a video file.
	play(src: URL) {
		const video = document.createElement("video");
		video.crossOrigin = "anonymous";
		video.src = src.toString();
		video.muted = this.sound.enabled.peek();
		video.playsInline = true;
		video.autoplay = true;
		//video.load();

		const onFrame = () => {
			this.video.frame.update((prev) => {
				prev?.close();
				return new VideoFrame(video);
			});
			video.requestVideoFrameCallback(onFrame);
		};

		video.requestVideoFrameCallback(onFrame);

		video.onloadedmetadata = () => {
			this.video.catalog.set([
				{
					track: { name: "video", priority: 0 },
					config: {
						codec: "fake",
						// Required for the correct display size.
						displayAspectWidth: u53(video.videoWidth),
						displayAspectHeight: u53(video.videoHeight),
					},
				},
			]);
		};

		// TODO Ideally we visualize the audio even when muted, but not suspended.
		// But I can't figure out why it works for memes but not here.
		this.sound.enabled.watch((enabled) => {
			video.muted = !enabled;
		});

		const node = this.sound.media(video);
		this.audio.root.set(node);

		// Called after the media element is connected to the audio context.
		video.play();

		video.onpause = () => {
			this.video.frame.update((prev) => {
				prev?.close();
				return undefined;
			});

			this.audio.root.update((prev) => {
				prev?.disconnect();
				return undefined;
			});

			this.video.catalog.set(undefined);
		};
	}

	// "plays" an image file.
	show(src: URL) {
		const image = new Image();
		image.src = src.toString();
		image.onload = () => {
			this.video.frame.update((prev) => {
				prev?.close();
				return new VideoFrame(image, { timestamp: 0 });
			});

			this.video.catalog.set([
				{
					track: { name: "image", priority: 0 },
					config: {
						codec: "fake",
						displayAspectWidth: u53(image.width),
						displayAspectHeight: u53(image.height),
					},
				},
			]);
		};
	}

	stop() {
		this.#video?.pause();
		this.#video = undefined;
	}

	close() {
		this.signals.close();
	}
}

export class FakeRoom {
	space: Space;
	sound: Sound;

	constructor(canvas: Canvas) {
		this.sound = new Sound(); // muted by default
		this.space = new Space(canvas, this.sound);
	}

	create(props?: FakeBroadcastProps): FakeBroadcast {
		return new FakeBroadcast(this.sound, props);
	}

	add(path: string, broadcast: FakeBroadcast) {
		this.space.add(path, broadcast);
	}

	remove(path: string) {
		this.space.remove(path).then((broadcast) => {
			broadcast.close();
		});
	}

	close() {
		this.space.close();
	}
}
