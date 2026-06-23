type RuntimeConfig = {
	API_URL?: string;
	APP_URL?: string;
};

declare global {
	interface Window {
		ONYX_CONFIG?: RuntimeConfig;
	}
}

const runtime = typeof window === "undefined" ? undefined : window.ONYX_CONFIG;

export const API_URL = runtime?.API_URL || import.meta.env.VITE_API_URL;
export const APP_URL = runtime?.APP_URL || import.meta.env.VITE_APP_URL;
