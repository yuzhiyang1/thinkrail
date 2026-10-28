import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type {
	CustomAction,
	CustomActionCatalog,
	CustomActionRun,
	CustomActionsSnapshot,
} from "@thinkrail/contracts";
import { loadCustomActionsRecord, saveCustomActionsRecord } from "../persistence";

const OUTPUT_BYTES = 128 * 1024;
const MAX_ACTIONS = 100;
const runs = new Map<string, CustomActionRun>();
const children = new Map<string, () => void>();

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, empty = false): value is string {
	return (
		typeof value === "string" &&
		(empty || value.trim().length > 0) &&
		value.length <= max &&
		!value.includes("\0")
	);
}

function validAction(value: unknown): value is CustomAction {
	if (!record(value)) return false;
	return (
		text(value.id, 100) &&
		text(value.name, 100) &&
		text(value.program, 4096) &&
		Array.isArray(value.args) &&
		value.args.length <= 100 &&
		value.args.every((arg) => text(arg, 16384, true)) &&
		text(value.cwd, 4096) &&
		isAbsolute(value.cwd) &&
		(value.projectId === null || text(value.projectId, 100)) &&
		typeof value.timeoutSeconds === "number" &&
		Number.isInteger(value.timeoutSeconds) &&
		value.timeoutSeconds >= 1 &&
		value.timeoutSeconds <= 1800 &&
		text(value.resultUrl, 4096, true) &&
		validUrl(value.resultUrl)
	);
}

function validUrl(value: string): boolean {
	if (value === "") return true;
	try {
		const url = new URL(value);
		return (
			(url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
		);
	} catch {
		return false;
	}
}

function validateActions(value: unknown): CustomAction[] {
	if (
		!Array.isArray(value) ||
		value.length > MAX_ACTIONS ||
		!value.every(validAction) ||
		new Set(value.map((action) => action.id)).size !== value.length
	) {
		throw new Error(
			"Invalid actions: provide unique ids, an executable, arguments, an absolute directory and a timeout of 1–1800 seconds",
		);
	}
	return value.map((action) => ({
		id: action.id,
		name: action.name.trim(),
		program: action.program.trim(),
		args: [...action.args],
		cwd: action.cwd,
		projectId: action.projectId,
		timeoutSeconds: action.timeoutSeconds,
		resultUrl: action.resultUrl,
	}));
}

function catalog(): CustomActionCatalog {
	const value = loadCustomActionsRecord();
	if (value === null) return { revision: "0", actions: [] };
	if (!record(value) || !text(value.revision, 100))
		throw new Error("Invalid custom action catalog");
	return { revision: value.revision, actions: validateActions(value.actions) };
}

function assertRevision(value: CustomActionCatalog, revision: string): void {
	if (value.revision !== revision)
		throw new Error(
			"Actions changed in another window. Reload the action catalog before saving or running.",
		);
}

export function listActions(): CustomActionsSnapshot {
	const value = catalog();
	return {
		...value,
		runs: structuredClone(
			[...runs.values()].filter((run) =>
				value.actions.some((action) => action.id === run.actionId),
			),
		),
	};
}

export function saveActions(revision: string, input: CustomAction[]): CustomActionsSnapshot {
	const current = catalog();
	assertRevision(current, revision);
	const actions = validateActions(input);
	for (const previous of current.actions) {
		const run = runs.get(previous.id);
		if (!run || !children.has(run.id)) continue;
		const next = actions.find((action) => action.id === previous.id);
		if (JSON.stringify(previous) !== JSON.stringify(next))
			throw new Error("Stop the running command before editing or removing it");
	}
	saveCustomActionsRecord({ revision: randomUUID(), actions });
	for (const id of runs.keys()) if (!actions.some((action) => action.id === id)) runs.delete(id);
	return listActions();
}

function terminate(child: ChildProcess): void {
	if (!child.pid) return;
	if (process.platform === "win32") {
		const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
			windowsHide: true,
			stdio: "ignore",
		});
		killer.on("error", () => child.kill("SIGKILL"));
		killer.on("exit", (code) => {
			if (code !== 0) child.kill("SIGKILL");
		});
		return;
	}
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

function launch(action: CustomAction, run: CustomActionRun): void {
	const child = spawn(action.program, action.args, {
		cwd: action.cwd,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
		detached: process.platform !== "win32",
		windowsHide: true,
	});
	const append = (chunk: string) => {
		const output = Buffer.concat([Buffer.from(run.output), Buffer.from(chunk)]);
		if (output.length > OUTPUT_BYTES) run.truncated = true;
		let start = Math.max(0, output.length - OUTPUT_BYTES);
		while (start < output.length && ((output[start] ?? 0) & 0xc0) === 0x80) start += 1;
		run.output = output.subarray(start).toString("utf8");
	};
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", append);
	child.stderr?.on("data", append);
	let settled = false;
	const finish = (code: number | null, error?: Error) => {
		if (settled) return;
		settled = true;
		clearTimeout(timeout);
		children.delete(run.id);
		if (error) append(error.message);
		if (run.status === "running") run.status = code === 0 ? "succeeded" : "failed";
		run.exitCode = code;
		run.finishedAt = Date.now();
		const drain = setTimeout(() => {
			child.stdout?.destroy();
			child.stderr?.destroy();
		}, 250);
		drain.unref();
	};
	const stop = () => {
		if (settled) return;
		run.status = "cancelled";
		terminate(child);
	};
	const timeout = setTimeout(() => {
		run.status = "timed-out";
		terminate(child);
	}, action.timeoutSeconds * 1000);
	timeout.unref();
	children.set(run.id, stop);
	child.once("error", (error) => finish(null, error));
	child.once("exit", (code) => finish(code));
}

export function runAction(id: string, revision: string, projectId: string | null): CustomActionRun {
	const current = catalog();
	assertRevision(current, revision);
	const action = current.actions.find((entry) => entry.id === id);
	if (!action) throw new Error("Unknown custom action");
	if (action.projectId !== null && action.projectId !== projectId)
		throw new Error("This action belongs to another project");
	const existing = runs.get(id);
	if (existing && children.has(existing.id)) return structuredClone(existing);
	if (children.size >= 4)
		throw new Error("Four commands are already running. Wait for one to finish.");
	if (!statSync(action.cwd, { throwIfNoEntry: false })?.isDirectory())
		throw new Error("The action's working directory does not exist on this host");
	const run: CustomActionRun = {
		id: randomUUID(),
		actionId: id,
		name: action.name,
		program: action.program,
		args: [...action.args],
		cwd: action.cwd,
		resultUrl: action.resultUrl,
		status: "running",
		startedAt: Date.now(),
		finishedAt: null,
		exitCode: null,
		output: "",
		truncated: false,
	};
	runs.set(id, run);
	try {
		launch(action, run);
	} catch (error) {
		run.status = "failed";
		run.finishedAt = Date.now();
		run.output = error instanceof Error ? error.message : "Could not start command";
	}
	return structuredClone(run);
}

export function stopAction(runId: string): CustomActionRun {
	const run = [...runs.values()].find((value) => value.id === runId);
	if (!run) throw new Error("Unknown action run");
	children.get(runId)?.();
	return structuredClone(run);
}

export function disposeActions(): void {
	for (const stop of children.values()) stop();
}
