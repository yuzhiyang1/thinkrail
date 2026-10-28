import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CustomAction, CustomActionRun } from "@thinkrail/contracts";
import { disposeActions, listActions, runAction, saveActions, stopAction } from "./index";

let dir: string;
const original = process.env.THINKRAIL_DATA_DIR;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "thinkrail-actions-"));
	process.env.THINKRAIL_DATA_DIR = dir;
});
afterEach(() => {
	disposeActions();
	if (original === undefined) delete process.env.THINKRAIL_DATA_DIR;
	else process.env.THINKRAIL_DATA_DIR = original;
	rmSync(dir, { recursive: true, force: true });
});

function action(code = "console.log('done')", id = crypto.randomUUID()): CustomAction {
	return {
		id,
		name: "Deploy dev",
		program: process.execPath,
		args: ["-e", code],
		cwd: dir,
		projectId: null,
		timeoutSeconds: 10,
		resultUrl: "https://example.com/pipeline",
	};
}
function save(...actions: CustomAction[]) {
	return saveActions(listActions().revision, actions);
}
async function finished(id: string): Promise<CustomActionRun> {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		const run = listActions().runs.find((entry) => entry.actionId === id);
		if (run?.finishedAt !== null && run !== undefined) return run;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Command did not finish");
}

test("catalog persists, preserves order and rejects stale edits and runs", () => {
	const a = action();
	const b = action();
	const before = listActions();
	const saved = saveActions(before.revision, [b, a]);
	expect(saved.actions.map((entry) => entry.id)).toEqual([b.id, a.id]);
	expect(JSON.parse(readFileSync(join(dir, "custom-actions.json"), "utf8")).revision).toBe(
		saved.revision,
	);
	expect(() => saveActions(before.revision, [])).toThrow("another window");
	expect(() => runAction(a.id, before.revision, null)).toThrow("another window");
});

test("rejects malformed definitions, duplicate ids, relative cwd and executable URLs", () => {
	const a = action();
	for (const patch of [
		{ cwd: "relative" },
		{ timeoutSeconds: 0 },
		{ timeoutSeconds: 1801 },
		{ program: "" },
		{ resultUrl: "javascript:alert(1)" },
	]) {
		expect(() => save({ ...a, ...patch })).toThrow("Invalid actions");
	}
	expect(() => save(a, a)).toThrow("Invalid actions");
});

test("malformed saved JSON fails instead of silently replacing the file", () => {
	const file = join(dir, "custom-actions.json");
	writeFileSync(file, "bad json");
	expect(() => listActions()).toThrow("Could not read");
	expect(readFileSync(file, "utf8")).toBe("bad json");
});

test("passes literal arguments, working directory and live host environment", async () => {
	const marker = "THINKRAIL_ACTION_TEST_VALUE";
	const old = process.env[marker];
	process.env[marker] = "host-value";
	try {
		const a = action(
			`console.log(JSON.stringify({cwd: process.cwd(), args: process.argv.slice(1), env: process.env.${marker}}))`,
		);
		a.args.push("$HOME; echo should-not-expand", "with spaces", "");
		const catalog = save(a);
		runAction(a.id, catalog.revision, null);
		const run = await finished(a.id);
		expect(run.status).toBe("succeeded");
		expect(JSON.parse(run.output)).toEqual({ cwd: dir, args: a.args.slice(2), env: "host-value" });
	} finally {
		if (old === undefined) delete process.env[marker];
		else process.env[marker] = old;
	}
});

test("scope and directory checks precede launch", () => {
	const a = { ...action(), projectId: "project-a" };
	const catalog = save(a);
	expect(() => runAction(a.id, catalog.revision, "project-b")).toThrow("another project");
	expect(listActions().runs).toHaveLength(0);
	const b = { ...action(), cwd: join(dir, "missing") };
	const next = save(b);
	expect(() => runAction(b.id, next.revision, null)).toThrow("does not exist");
});

test("deduplicates concurrent clicks and refuses edits/deletion while running", async () => {
	const a = action("setTimeout(() => console.log('finished'), 150)");
	const catalog = save(a);
	const first = runAction(a.id, catalog.revision, null);
	expect(runAction(a.id, catalog.revision, null).id).toBe(first.id);
	expect(() => save()).toThrow("Stop the running command");
	expect(() => save({ ...a, name: "changed" })).toThrow("Stop the running command");
	await finished(a.id);
	expect(save().actions).toHaveLength(0);
});

test("captures stderr and nonzero exit, plus executable launch failures", async () => {
	const a = action("console.error('failed to trigger'); process.exit(7)");
	const catalog = save(a);
	runAction(a.id, catalog.revision, null);
	const run = await finished(a.id);
	expect(run.status).toBe("failed");
	expect(run.exitCode).toBe(7);
	expect(run.output).toContain("failed to trigger");
	const b = { ...action(), program: join(dir, "no-such-program") };
	const next = save(b);
	runAction(b.id, next.revision, null);
	expect((await finished(b.id)).status).toBe("failed");
});

test("bounds noisy output without blocking the child", async () => {
	const a = action("process.stdout.write('x'.repeat(1024*1024)); console.error('tail-marker')");
	const catalog = save(a);
	runAction(a.id, catalog.revision, null);
	const run = await finished(a.id);
	expect(run.status).toBe("succeeded");
	expect(run.truncated).toBe(true);
	expect(Buffer.byteLength(run.output)).toBeLessThanOrEqual(128 * 1024);
	expect(run.output.length).toBeGreaterThan(100000);
});

test("timeout, explicit stop and host disposal terminate commands", async () => {
	const a = { ...action("setInterval(() => {}, 1000)"), timeoutSeconds: 1 };
	let catalog = save(a);
	runAction(a.id, catalog.revision, null);
	expect((await finished(a.id)).status).toBe("timed-out");
	const b = action("setInterval(() => {}, 1000)");
	catalog = save(b);
	const run = runAction(b.id, catalog.revision, null);
	stopAction(run.id);
	expect((await finished(b.id)).status).toBe("cancelled");
	const c = action("setInterval(() => {}, 1000)");
	catalog = save(c);
	runAction(c.id, catalog.revision, null);
	disposeActions();
	expect((await finished(c.id)).status).toBe("cancelled");
});

test("preserves UTF-8 across stream chunks and output truncation", async () => {
	const a = action("process.stdout.write('部署成功'.repeat(20000))");
	const catalog = save(a);
	runAction(a.id, catalog.revision, null);
	const run = await finished(a.id);
	expect(run.status).toBe("succeeded");
	expect(run.truncated).toBe(true);
	expect(run.output).not.toContain("\ufffd");
	expect(Buffer.byteLength(run.output)).toBeLessThanOrEqual(128 * 1024);
});
