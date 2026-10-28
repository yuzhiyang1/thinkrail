import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeOrCheck } from "./generatedFiles";

type SourceColor = { value: string | null; file?: string; key?: string; adaptation?: string };
interface SourceTheme {
	id: string;
	label: string;
	order: number;
	appearance: string;
	contrast: string;
	colors: Record<string, SourceColor>;
	ansi: Record<string, SourceColor>;
	syntax: Record<string, SourceColor>;
}
interface Sources {
	upstream: { version: string; commit: string; files: Record<string, string> };
	themes: SourceTheme[];
}

const root = join(import.meta.dir, "..");
const sources: Sources = JSON.parse(
	readFileSync(join(import.meta.dir, "intellij-islands.sources.json"), "utf8"),
);
const values = (group: Record<string, SourceColor>) =>
	Object.fromEntries(
		Object.entries(group).map(([key, source]) => {
			if (!(source.file && source.key && sources.upstream.files[source.file]) && !source.adaptation)
				throw new Error(`Missing color provenance: ${key}`);
			return [key, source.value];
		}),
	);

writeOrCheck({
	label: "intellij-themes",
	version: sources.upstream.version,
	check: process.argv.includes("--check"),
	outputs: sources.themes.map(({ colors, ansi, syntax, ...metadata }) => ({
		path: join(root, "src/themes/bundled", `${metadata.id}.theme.json`),
		content: `${JSON.stringify(
			{
				$schema: "../theme.schema.json",
				schemaVersion: 2,
				...metadata,
				colors: values(colors),
				ansi: values(ansi),
				syntax: values(syntax),
			},
			null,
			"\t",
		)}\n`,
	})),
});
