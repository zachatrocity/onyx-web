import { Catalog } from "@moq/hang";
import { z } from "zod";

export const SpeakingCatalogSchema = z.object({
	track: Catalog.TrackSchema,
});

export type SpeakingCatalog = z.infer<typeof SpeakingCatalogSchema>;

export const SpeakingSection = new Catalog.Section("speaking", SpeakingCatalogSchema);

export const TRACK = "speaking.bool";
