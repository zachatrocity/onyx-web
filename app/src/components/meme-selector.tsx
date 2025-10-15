import type { Publish } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createEffect, createSignal, For, onCleanup, onMount, type Setter, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Meme from "../room/meme";
import Settings from "../settings";

export type Tab = "emoji" | "audio" | "video";

export type MemeSelectorProps = {
	broadcast: Publish.Broadcast;
	chatInput: HTMLInputElement | undefined;
	chatMessage: string;
	setChatMessage: Setter<string>;
	onClose: () => void;
};

// ============================================================================
// EmojiTab Component
// ============================================================================

type EmojiTabProps = {
	chatInput: HTMLInputElement | undefined;
	chatMessage: string;
	setChatMessage: Setter<string>;
};

function EmojiTab(props: EmojiTabProps): JSX.Element {
	const insertEmoji = (emoji: string) => {
		const input = props.chatInput;
		if (!input) {
			props.setChatMessage(props.chatMessage + emoji);
			return;
		}

		const start = input.selectionStart ?? props.chatMessage.length;
		const end = input.selectionEnd ?? props.chatMessage.length;
		const newMessage = props.chatMessage.slice(0, start) + emoji + props.chatMessage.slice(end);
		props.setChatMessage(newMessage);

		// Set cursor position after emoji
		setTimeout(() => {
			input.focus();
			const newPosition = start + emoji.length;
			input.setSelectionRange(newPosition, newPosition);
		}, 0);
	};

	return (
		<div class="space-y-4">
			<For each={Object.entries(Meme.EMOJI_CATEGORIES)}>
				{([category, emojis]) => (
					<div>
						<div class="text-xs text-white/40 uppercase tracking-wider mb-2">{category}</div>
						<div class="flex flex-wrap gap-1">
							<For each={emojis}>
								{(emoji) => (
									<button
										type="button"
										onClick={() => insertEmoji(emoji)}
										class="w-10 h-10 hover:bg-white/10 rounded transition-colors text-xl cursor-pointer flex items-center justify-center"
										title={`Insert ${emoji}`}
									>
										{emoji}
									</button>
								)}
							</For>
						</div>
					</div>
				)}
			</For>
		</div>
	);
}

// ============================================================================
// AudioMemeItem Component
// ============================================================================

type AudioMemeItemProps = {
	name: Meme.AudioName;
	data: Meme.Source;
	onSend: (memeName: string) => void;
	currentlyPlaying: string | null;
	onPreviewStart: (name: string) => void;
};

function AudioMemeItem(props: AudioMemeItemProps): JSX.Element {
	const [preview, setPreview] = createSignal<Meme.Audio | null>(null);

	const stopPreview = () => {
		const current = preview();
		if (current) {
			current.element.pause();
			setPreview(null);
		}
	};

	// Stop preview when another meme starts playing
	createEffect(() => {
		if (props.currentlyPlaying !== null && props.currentlyPlaying !== props.name) {
			stopPreview();
		}
	});

	onCleanup(() => {
		stopPreview();
	});

	const togglePreview = () => {
		const current = preview();
		if (current) {
			stopPreview();
			// Only clear if this was the currently playing meme
			if (props.currentlyPlaying === props.name) {
				props.onPreviewStart("");
			}
		} else {
			// Notify parent to stop other previews
			props.onPreviewStart(props.name);

			// Start playing
			const audio = Meme.audio(props.name);
			if (!audio) throw new Error(`Audio meme not found: ${props.name}`);

			audio.element.volume = Settings.audio.volume.peek();
			audio.element.muted = false;
			audio.element.play();

			setPreview(audio);

			// Clean up when done
			audio.element.onended = () => {
				setPreview(null);
				// Only clear if this is still the currently playing meme
				if (props.currentlyPlaying === props.name) {
					props.onPreviewStart("");
				}
			};
			audio.element.onpause = () => {
				setPreview(null);
				// Only clear if this is still the currently playing meme
				if (props.currentlyPlaying === props.name) {
					props.onPreviewStart("");
				}
			};
		}
	};

	const isPlaying = () => preview() !== null;

	return (
		<div class="group relative bg-white/10 hover:bg-white/20 rounded p-3 transition-colors cursor-pointer basis-34 flex-grow">
			<button
				type="button"
				onClick={() => props.onSend(props.name)}
				class="w-full text-left text-sm truncate text-white cursor-pointer flex items-center gap-2"
				title={`Send /${props.name}`}
			>
				<span class="text-lg">{props.data.emoji}</span>
				<span>/{props.name}</span>
			</button>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					togglePreview();
				}}
				class="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-white/20 hover:bg-white/30 rounded transition-opacity cursor-pointer [@media(pointer:coarse)]:opacity-100"
				classList={{
					"opacity-100": isPlaying(),
					"opacity-0 group-hover:opacity-100": !isPlaying(),
				}}
				title={isPlaying() ? "Stop" : "Preview"}
			>
				<Show when={isPlaying()} fallback={<span class="icon-[mdi--play] w-4 h-4 text-white" />}>
					<span class="icon-[mdi--pause] w-4 h-4 text-white" />
				</Show>
			</button>
		</div>
	);
}

// ============================================================================
// AudioTab Component
// ============================================================================

type AudioTabProps = {
	onSend: (memeName: string) => void;
	currentlyPlaying: string | null;
	onPreviewStart: (name: string) => void;
};

function AudioTab(props: AudioTabProps): JSX.Element {
	const sortedAudioMemes = () => {
		// Filter out audio memes that have corresponding video versions
		const videoMemeNames = Object.keys(Meme.VIDEO);
		return Object.keys(Meme.AUDIO)
			.filter((name) => !videoMemeNames.includes(name))
			.sort() as Meme.AudioName[];
	};

	return (
		<div class="flex flex-wrap gap-2">
			<For each={sortedAudioMemes()}>
				{(meme) => {
					const memeData = Meme.AUDIO[meme as keyof typeof Meme.AUDIO];
					return (
						<AudioMemeItem
							name={meme}
							data={memeData}
							onSend={props.onSend}
							currentlyPlaying={props.currentlyPlaying}
							onPreviewStart={props.onPreviewStart}
						/>
					);
				}}
			</For>
		</div>
	);
}

// ============================================================================
// VideoMemeItem Component
// ============================================================================

type VideoMemeItemProps = {
	name: Meme.VideoName;
	data: Meme.Source;
	onSend: (memeName: string) => void;
	currentlyPlaying: string | null;
	onPreviewStart: (name: string) => void;
};

function VideoMemeItem(props: VideoMemeItemProps): JSX.Element {
	const [preview, setPreview] = createSignal<Meme.Video | null>(null);
	let videoContainer: HTMLDivElement | undefined;

	const stopPreview = () => {
		const current = preview();
		if (current) {
			current.element.pause();
			current.element.remove();
			setPreview(null);
		}
	};

	// Stop preview when another meme starts playing
	createEffect(() => {
		if (props.currentlyPlaying !== null && props.currentlyPlaying !== props.name) {
			stopPreview();
		}
	});

	onCleanup(() => {
		stopPreview();
	});

	const togglePreview = () => {
		const current = preview();
		if (current) {
			stopPreview();
			// Only clear if this was the currently playing meme
			if (props.currentlyPlaying === props.name) {
				props.onPreviewStart("");
			}
		} else {
			// Notify parent to stop other previews
			props.onPreviewStart(props.name);

			// Start playing
			const video = Meme.video(props.name);
			if (!video) throw new Error(`Video meme not found: ${props.name}`);

			video.element.volume = Settings.audio.volume.peek();
			video.element.muted = false;
			video.element.style.width = "100%";
			video.element.style.height = "100%";
			video.element.style.position = "absolute";
			video.element.style.inset = "0";
			video.element.style.zIndex = "5";

			video.element.play().catch((err) => {
				console.error(`Meme failed to play: ${props.name}`, err);
			});

			if (videoContainer) {
				videoContainer.appendChild(video.element);
			}

			setPreview(video);

			// Clean up when done
			video.element.onended = () => {
				video.element.remove();
				setPreview(null);
				// Only clear if this is still the currently playing meme
				if (props.currentlyPlaying === props.name) {
					props.onPreviewStart("");
				}
			};
			video.element.onpause = () => {
				video.element.remove();
				setPreview(null);
				// Only clear if this is still the currently playing meme
				if (props.currentlyPlaying === props.name) {
					props.onPreviewStart("");
				}
			};
		}
	};

	const isPlaying = () => preview() !== null;

	return (
		<div
			ref={videoContainer}
			class="group relative bg-white/10 hover:bg-white/20 rounded overflow-hidden transition-colors cursor-pointer aspect-video basis-42 flex-grow"
		>
			{/* Thumbnail background */}
			<img
				src={new URL(`/meme/${props.data.thumbnail}`, import.meta.env.VITE_APP_URL).toString()}
				alt={props.name}
				class="absolute inset-0 w-full h-full opacity-30"
				style={{
					"object-fit": props.data.fit || "contain",
					"object-position": props.data.position || "center",
				}}
			/>
			<button
				type="button"
				onClick={() => props.onSend(props.name)}
				class="relative z-10 w-full h-full flex items-center justify-center p-3 cursor-pointer"
				title={`Send /${props.name}`}
			>
				<span class="text-sm text-white font-medium text-center drop-shadow-lg">/{props.name}</span>
			</button>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					togglePreview();
				}}
				class="absolute right-2 bottom-2 z-20 p-1 bg-white/20 hover:bg-white/30 rounded transition-opacity cursor-pointer [@media(pointer:coarse)]:opacity-100"
				classList={{
					"opacity-100": isPlaying(),
					"opacity-0 group-hover:opacity-100": !isPlaying(),
				}}
				title={isPlaying() ? "Stop" : "Preview"}
			>
				<Show when={isPlaying()} fallback={<span class="icon-[mdi--play] w-4 h-4 text-white" />}>
					<span class="icon-[mdi--pause] w-4 h-4 text-white" />
				</Show>
			</button>
		</div>
	);
}

// ============================================================================
// VideoTab Component
// ============================================================================

type VideoTabProps = {
	onSend: (memeName: string) => void;
	currentlyPlaying: string | null;
	onPreviewStart: (name: string) => void;
};

function VideoTab(props: VideoTabProps): JSX.Element {
	const sortedVideoMemes = () => {
		return Object.keys(Meme.VIDEO).sort() as Meme.VideoName[];
	};

	return (
		<div class="flex flex-wrap gap-2">
			<For each={sortedVideoMemes()}>
				{(meme) => {
					const memeData = Meme.VIDEO[meme];
					return (
						<VideoMemeItem
							name={meme}
							data={memeData}
							onSend={props.onSend}
							currentlyPlaying={props.currentlyPlaying}
							onPreviewStart={props.onPreviewStart}
						/>
					);
				}}
			</For>
		</div>
	);
}

// ============================================================================
// MemeSelector Main Component
// ============================================================================

export function MemeSelector(props: MemeSelectorProps): JSX.Element {
	const activeTab = solid(Settings.meme.tab);
	const [currentlyPlaying, setCurrentlyPlaying] = createSignal<string | null>(null);
	const [modal, setModal] = createSignal<HTMLDivElement | undefined>(undefined);

	// Clean up previews when component unmounts or closes
	onCleanup(() => {
		setCurrentlyPlaying(null);
	});

	// Close on escape key
	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			props.onClose();
		}
	};

	onMount(() => {
		window.addEventListener("keydown", handleKeyDown);
		onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
	});

	// Save tab preference when it changes
	createSignal(() => {
		localStorage.setItem("settings.memeSelector.tab", activeTab());
	});

	// Handle clicking outside
	const handleClickOutside = (e: MouseEvent) => {
		if (modal() && !modal()?.contains(e.target as Node)) {
			props.onClose();
		}
	};

	onMount(() => {
		// Delay to prevent immediate close from the button click that opened it
		setTimeout(() => {
			window.addEventListener("click", handleClickOutside);
		}, 100);
		onCleanup(() => window.removeEventListener("click", handleClickOutside));
	});

	const sendMeme = (memeName: string) => {
		// Send the slash command
		if (props.broadcast.chat.message.enabled.peek()) {
			props.broadcast.chat.message.latest.update(() => `/${memeName}`);
		}
		props.onClose();
	};

	return (
		<div
			ref={setModal}
			class="fixed bottom-20 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[800px] sm:max-w-[90vw] max-h-[80vh] flex flex-col bg-black/80 border border-white/20 rounded-lg shadow-2xl pointer-events-auto backdrop-blur-lg z-[100]"
		>
			{/* Header with tabs */}
			<div class="flex items-center justify-between border-b border-white/20 p-2 sm:p-3 shrink-0">
				<div class="flex gap-1 sm:gap-2">
					<button
						type="button"
						onClick={() => Settings.meme.tab.set("emoji")}
						class="px-2 sm:px-3 py-1 sm:py-1.5 rounded flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm transition-colors cursor-pointer"
						classList={{
							"bg-white/20 text-white": activeTab() === "emoji",
							"hover:bg-white/10 text-white/60": activeTab() !== "emoji",
						}}
					>
						<span class="icon-[mdi--emoticon-happy] w-4 h-4" />
						Emoji
					</button>
					<button
						type="button"
						onClick={() => Settings.meme.tab.set("audio")}
						class="px-2 sm:px-3 py-1 sm:py-1.5 rounded flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm transition-colors cursor-pointer"
						classList={{
							"bg-white/20 text-white": activeTab() === "audio",
							"hover:bg-white/10 text-white/60": activeTab() !== "audio",
						}}
					>
						<span class="icon-[mdi--music] w-4 h-4" />
						Audio
					</button>
					<button
						type="button"
						onClick={() => Settings.meme.tab.set("video")}
						class="px-2 sm:px-3 py-1 sm:py-1.5 rounded flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm transition-colors cursor-pointer"
						classList={{
							"bg-white/20 text-white": activeTab() === "video",
							"hover:bg-white/10 text-white/60": activeTab() !== "video",
						}}
					>
						<span class="icon-[mdi--video] w-4 h-4" />
						Video
					</button>
				</div>
				<div class="flex items-center gap-2">
					{/* Playing indicator */}
					<Show when={currentlyPlaying() !== null && currentlyPlaying() !== ""}>
						<div class="bg-green-600 text-white text-xs px-2 py-1 rounded animate-pulse flex items-center gap-1">
							<span class="icon-[mdi--volume-high] w-3 h-3" />
							<span>Preview</span>
						</div>
					</Show>
					<button
						type="button"
						onClick={props.onClose}
						class="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer text-white"
						aria-label="Close"
					>
						<span class="icon-[mdi--close]" />
					</button>
				</div>
			</div>

			{/* Content area */}
			<div class="p-2 sm:p-3 overflow-y-auto flex-1 custom-scrollbar" onWheel={(e) => e.stopPropagation()}>
				<Show when={activeTab() === "emoji"}>
					<EmojiTab
						chatInput={props.chatInput}
						chatMessage={props.chatMessage}
						setChatMessage={props.setChatMessage}
					/>
				</Show>

				<Show when={activeTab() === "audio"}>
					<AudioTab
						onSend={sendMeme}
						currentlyPlaying={currentlyPlaying()}
						onPreviewStart={setCurrentlyPlaying}
					/>
				</Show>

				<Show when={activeTab() === "video"}>
					<VideoTab
						onSend={sendMeme}
						currentlyPlaying={currentlyPlaying()}
						onPreviewStart={setCurrentlyPlaying}
					/>
				</Show>
			</div>
		</div>
	);
}
