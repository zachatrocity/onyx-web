import { Effect } from "@kixelated/signals";
import * as DOM from "@kixelated/signals/dom";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { Bounds, Vector } from "./geometry";

export class Debug {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	constructor(broadcast: Broadcast, canvas: Canvas) {
		this.broadcast = broadcast;
		this.canvas = canvas;

		this.signals.effect(this.#render.bind(this));
	}

	#render(effect: Effect) {
		if (!effect.get(Settings.debug.video)) return;

		const root = DOM.create("div", {
			className: "fixed pointer-events-none select-none",
		});

		const infoBox = DOM.create("div", {
			className:
				"absolute top-1 right-1 bg-black/75 text-white px-2 py-1 rounded font-mono text-[11px] leading-snug",
		});

		root.appendChild(infoBox);

		// Update the position of the debug overlay when the broadcast bounds or viewport changes
		const updatePosition = (bounds: Bounds, viewport: Vector) => {
			// Get the canvas element's position on the page
			const canvasRect = this.canvas.element.getBoundingClientRect();

			// Scale bounds from canvas coordinates to page coordinates
			const scaleX = canvasRect.width / viewport.x;
			const scaleY = canvasRect.height / viewport.y;

			// Transform bounds to page coordinates
			const pageBounds = {
				x: bounds.position.x * scaleX + canvasRect.left,
				y: bounds.position.y * scaleY + canvasRect.top,
				width: bounds.size.x * scaleX,
				height: bounds.size.y * scaleY,
			};

			root.style.left = `${Math.round(pageBounds.x)}px`;
			root.style.top = `${Math.round(pageBounds.y)}px`;
			root.style.width = `${Math.round(pageBounds.width)}px`;
			root.style.height = `${Math.round(pageBounds.height)}px`;
		};

		// Update info box content when frame changes
		effect.effect((effect) => {
			const frame = effect.get(this.broadcast.source.video.frame);
			if (frame) {
				infoBox.innerHTML = `${frame.codedWidth}x${frame.codedHeight}`;
			} else {
				infoBox.textContent = "No video frame";
			}
		});

		// Update position when bounds, viewport, or zoom change
		effect.effect((effect) => {
			const bounds = effect.get(this.broadcast.bounds);
			const viewport = effect.get(this.broadcast.canvas.viewport);
			updatePosition(bounds, viewport);
		});

		// Update position when window scrolls
		effect.event(
			window,
			"scroll",
			() => {
				const bounds = this.broadcast.bounds.peek();
				const viewport = this.broadcast.canvas.viewport.peek();
				updatePosition(bounds, viewport);
			},
			{ passive: true },
		);

		// Update z-index based on broadcast position
		effect.effect((effect) => {
			const z = effect.get(this.broadcast.position).z;
			root.style.zIndex = `${100 + z}`;
		});

		DOM.render(effect, document.body, root);
	}

	close() {
		this.signals.close();
	}
}
