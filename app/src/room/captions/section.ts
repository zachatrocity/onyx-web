import { Catalog } from "@moq/hang";
import { z } from "zod";

export const CaptionsCatalogSchema = z.object({
	track: Catalog.TrackSchema,
});

export type CaptionsCatalog = z.infer<typeof CaptionsCatalogSchema>;

export const CaptionsSection = new Catalog.Section("captions", CaptionsCatalogSchema);

export const TRACK = "captions.txt";
