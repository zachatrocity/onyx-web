import { serve } from "@hono/node-server";
import { loadNodeEnv } from "./config";
import app from "./index";

const env = loadNodeEnv();

serve(
	{
		fetch: (request) => app.fetch(request, env),
		port: env.PORT,
	},
	(info) => {
		console.log(`API listening on http://0.0.0.0:${info.port}`);
		console.log(`SQLite database: ${env.DATABASE_PATH}`);
		console.log(`Public storage: ${env.PUBLIC_STORAGE_PATH}`);
	},
);
