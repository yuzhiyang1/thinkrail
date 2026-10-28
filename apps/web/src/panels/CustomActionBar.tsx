import {
	RiAddLine,
	RiArrowDownLine,
	RiArrowUpLine,
	RiDeleteBinLine,
	RiExternalLinkLine,
	RiFileListLine,
	RiPlayLine,
	RiSettings3Line,
	RiStopLine,
} from "@remixicon/react";
import {
	CUSTOM_ACTIONS_PROTOCOL_VERSION,
	type CustomAction,
	type CustomActionRun,
	type CustomActionsSnapshot,
	type Project,
} from "@thinkrail/contracts";
import { useT } from "@thinkrail/locales/react";
import { Button, IconButton } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { useEffect, useState } from "react";
import { randomId } from "../lib";
import { toast, useAppStore } from "../store";
import { errorText, getTransport } from "../transport";
import { SettingsNotice } from "./SettingsNotice";

const INPUT =
	"w-full min-w-0 rounded-sm border border-control-border-default bg-control-bg px-8 py-4 tr-code-text text-text-default outline-none focus-visible:border-control-border-active";
const STATUS_KEYS = {
	running: "actions.status.running",
	succeeded: "actions.status.succeeded",
	failed: "actions.status.failed",
	"timed-out": "actions.status.timed-out",
	cancelled: "actions.status.cancelled",
} as const;
const EMPTY: CustomActionsSnapshot = { revision: "0", actions: [], runs: [] };

function newAction(project: Project | null): CustomAction {
	return {
		id: randomId("action"),
		name: "",
		program: "",
		args: [],
		cwd: project?.path ?? "",
		projectId: null,
		timeoutSeconds: 300,
		resultUrl: "",
	};
}

function ActionEditor({
	action,
	projects,
	busy,
	onSave,
	onCancel,
}: {
	action: CustomAction;
	projects: Project[];
	busy: boolean;
	onSave: (action: CustomAction) => void;
	onCancel: () => void;
}) {
	const t = useT();
	const [draft, setDraft] = useState(action);
	const [args, setArgs] = useState(action.args.join("\n"));
	const fields = [
		["name", "actions.name"],
		["program", "actions.program"],
		["cwd", "actions.cwd"],
		["resultUrl", "actions.resultUrl"],
	] as const;
	return (
		<form
			data-testid="action-editor"
			className="flex min-w-0 flex-col gap-12"
			onSubmit={(event) => {
				event.preventDefault();
				onSave({ ...draft, args: args === "" ? [] : args.replace(/\r\n/g, "\n").split("\n") });
			}}
		>
			<fieldset disabled={busy} className="flex min-w-0 flex-col gap-12">
				{fields.map(([field, label]) => (
					<label key={field} className="flex min-w-0 flex-col gap-4 tr-text-ui">
						{t(label)}
						<input
							data-testid={`action-${field}`}
							className={INPUT}
							value={draft[field]}
							required={field !== "resultUrl"}
							maxLength={field === "name" ? 100 : 4096}
							type={field === "resultUrl" ? "url" : "text"}
							onChange={(event) => setDraft({ ...draft, [field]: event.currentTarget.value })}
						/>
					</label>
				))}
				<label className="flex flex-col gap-4 tr-text-ui">
					{t("actions.args")}
					<textarea
						data-testid="action-args"
						className={`${INPUT} min-h-96 resize-y`}
						value={args}
						onChange={(event) => setArgs(event.currentTarget.value)}
					/>
					<span className="tr-text-metadata text-text-muted">{t("actions.argsHint")}</span>
				</label>
				<div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
					<label className="flex flex-col gap-4 tr-text-ui">
						{t("actions.scope")}
						<select
							data-testid="action-scope"
							className={INPUT}
							value={draft.projectId ?? ""}
							onChange={(event) =>
								setDraft({ ...draft, projectId: event.currentTarget.value || null })
							}
						>
							<option value="">{t("actions.global")}</option>
							{draft.projectId && !projects.some((project) => project.id === draft.projectId) ? (
								<option value={draft.projectId}>{t("actions.closedProject")}</option>
							) : null}
							{projects.map((project) => (
								<option key={project.id} value={project.id}>
									{project.name}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-4 tr-text-ui">
						{t("actions.timeout")}
						<input
							data-testid="action-timeout"
							className={INPUT}
							type="number"
							min={1}
							max={1800}
							required
							value={draft.timeoutSeconds}
							onChange={(event) =>
								setDraft({ ...draft, timeoutSeconds: Number(event.currentTarget.value) })
							}
						/>
					</label>
				</div>
				<p className="tr-text-metadata text-text-muted">{t("actions.cwdHint")}</p>
				<div className="flex justify-end gap-8">
					<Button variant="outline" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
					<Button type="submit" loading={busy} data-testid="action-save">
						{t("common.save")}
					</Button>
				</div>
			</fieldset>
		</form>
	);
}

function RunDetails({
	run,
	connected,
	onStop,
}: {
	run: CustomActionRun;
	connected: boolean;
	onStop: () => void;
}) {
	const t = useT();
	return (
		<div className="flex min-h-0 flex-col gap-12" data-testid="action-run-details">
			<div className="flex flex-wrap items-center gap-8">
				<span
					role="status"
					data-testid="action-run-status"
					data-status={run.status}
					className="tr-text-ui text-text-default"
				>
					{t(STATUS_KEYS[run.status])}
				</span>
				{run.exitCode !== null ? (
					<span className="tr-text-metadata text-text-muted">
						{t("actions.exitCode", { code: run.exitCode })}
					</span>
				) : null}
				{run.finishedAt === null ? (
					<Button
						size="s"
						variant="outline"
						iconLeft={RiStopLine}
						disabled={!connected || run.status !== "running"}
						onClick={onStop}
					>
						{t("actions.stop")}
					</Button>
				) : null}
				{run.resultUrl ? (
					<a
						href={run.resultUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-4 tr-text-ui text-primary underline"
					>
						<RiExternalLinkLine className="size-14" />
						{t("actions.openResult")}
					</a>
				) : null}
			</div>
			<p className="break-all tr-code-text text-text-muted">{run.cwd}</p>
			<p className="break-all tr-code-text text-text-muted">
				{[run.program, ...run.args].map((part) => JSON.stringify(part)).join(" ")}
			</p>
			{run.truncated ? (
				<p className="tr-text-metadata text-feedback-warning">{t("actions.truncated")}</p>
			) : null}
			<pre
				data-testid="action-run-output"
				className="max-h-320 min-h-96 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-border-default bg-container-workspace-bg p-12 tr-code-text text-text-default"
			>
				{run.output || t("actions.noOutput")}
			</pre>
			<p className="tr-text-metadata text-text-muted">{t("actions.completionHint")}</p>
		</div>
	);
}

export function CustomActionBar({ project }: { project: Project | null }) {
	const t = useT();
	const status = useAppStore((state) => state.status);
	const protocol = useAppStore((state) => state.protocolVersion);
	const generation = useAppStore((state) => state.welcomeGeneration);
	const projects = useAppStore((state) => state.projects);
	const supported = protocol !== null && protocol >= CUSTOM_ACTIONS_PROTOCOL_VERSION;
	const connected = status === "connected" && supported;
	const [snapshot, setSnapshot] = useState<CustomActionsSnapshot>(EMPTY);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState("");
	const [manage, setManage] = useState(false);
	const [draft, setDraft] = useState<CustomAction | null>(null);
	const [editRevision, setEditRevision] = useState("0");
	const [busy, setBusy] = useState(false);
	const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());
	const [viewRunId, setViewRunId] = useState<string | null>(null);

	useEffect(() => {
		if (!connected) return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const poll = () =>
			getTransport()
				.request("action.list", {})
				.then((value) => {
					if (!disposed) {
						setSnapshot(value);
						setLoaded(true);
						setError("");
					}
				})
				.catch((cause) => {
					if (!disposed) setError(errorText(cause));
				})
				.finally(() => {
					if (!disposed) timer = setTimeout(poll, 1000);
				});
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [connected, generation]);

	const fail = (cause: unknown) => toast.error(errorText(cause, t("actions.failed")));
	const edit = (action: CustomAction) => {
		setDraft(action);
		setEditRevision(snapshot.revision);
	};
	const save = (actions: CustomAction[], revision: string) => {
		setBusy(true);
		getTransport()
			.request("action.save", { revision, actions })
			.then((value) => {
				setSnapshot(value);
				setDraft(null);
			})
			.catch(fail)
			.finally(() => setBusy(false));
	};
	const runAction = (action: CustomAction) => {
		setStarting((value) => new Set([...value, action.id]));
		getTransport()
			.request("action.run", {
				id: action.id,
				revision: snapshot.revision,
				projectId: project?.id ?? null,
			})
			.then((run) => {
				setSnapshot((value) => ({
					...value,
					runs: [...value.runs.filter((entry) => entry.actionId !== run.actionId), run],
				}));
				setViewRunId(run.actionId);
			})
			.catch(fail)
			.finally(() => setStarting((value) => new Set([...value].filter((id) => id !== action.id))));
	};
	const stop = (run: CustomActionRun) =>
		getTransport().request("action.stop", { runId: run.id }).catch(fail);
	const reorder = (index: number, offset: number) => {
		const actions = [...snapshot.actions];
		const item = actions.splice(index, 1)[0];
		if (item) {
			actions.splice(index + offset, 0, item);
			save(actions, snapshot.revision);
		}
	};
	const selectedRun = snapshot.runs.find((run) => run.actionId === viewRunId);
	if (!supported) return null;

	return (
		<>
			<div
				data-testid="custom-action-bar"
				className="flex min-w-0 items-center gap-8 border-b border-border-default bg-container-header-bg px-12 py-4"
			>
				<IconButton
					icon={RiSettings3Line}
					label={t("actions.manage")}
					data-testid="manage-actions"
					onClick={() => setManage(true)}
				/>
				<div className="flex min-w-0 flex-1 items-center gap-8 overflow-x-auto">
					{snapshot.actions
						.filter((action) => action.projectId === null || action.projectId === project?.id)
						.map((action) => {
							const run = snapshot.runs.find((entry) => entry.actionId === action.id);
							return (
								<div
									key={action.id}
									className="flex shrink-0 items-center gap-2"
									data-testid={`action-button-${action.id}`}
								>
									<Button
										size="s"
										variant="outline"
										iconLeft={RiPlayLine}
										disabled={!connected || !loaded}
										loading={starting.has(action.id) || run?.finishedAt === null}
										onClick={() => runAction(action)}
									>
										{action.name}
									</Button>
									{run ? (
										<IconButton
											size="s"
											icon={RiFileListLine}
											label={t("actions.logsFor", { name: action.name })}
											onClick={() => setViewRunId(action.id)}
										/>
									) : null}
								</div>
							);
						})}
					{snapshot.actions.length === 0 ? (
						<Button
							size="s"
							variant="ghost"
							iconLeft={RiAddLine}
							disabled={!connected || !loaded}
							onClick={() => {
								setManage(true);
								edit(newAction(project));
							}}
						>
							{t("actions.add")}
						</Button>
					) : null}
					{error ? (
						<span role="alert" className="tr-text-metadata text-feedback-error">
							{error}
						</span>
					) : null}
				</div>
			</div>
			<Dialog
				open={manage}
				onOpenChange={(open) => {
					setManage(open);
					if (!open) setDraft(null);
				}}
			>
				<DialogContent
					data-testid="custom-actions-dialog"
					className="max-h-[85vh] max-w-3xl overflow-y-auto"
				>
					<DialogHeader>
						<DialogTitle>{t("actions.manage")}</DialogTitle>
						<DialogDescription>{t("actions.description")}</DialogDescription>
					</DialogHeader>
					{error ? <SettingsNotice variant="error">{error}</SettingsNotice> : null}
					{draft ? (
						<ActionEditor
							key={draft.id}
							action={draft}
							projects={projects}
							busy={busy || !connected}
							onCancel={() => setDraft(null)}
							onSave={(action) =>
								save(
									snapshot.actions.some((entry) => entry.id === action.id)
										? snapshot.actions.map((entry) => (entry.id === action.id ? action : entry))
										: [...snapshot.actions, action],
									editRevision,
								)
							}
						/>
					) : (
						<>
							<div className="flex flex-col gap-8">
								{snapshot.actions.map((action, index) => {
									const running = snapshot.runs.some(
										(run) => run.actionId === action.id && run.finishedAt === null,
									);
									return (
										<div
											key={action.id}
											data-testid={`action-config-${action.id}`}
											className="flex min-w-0 items-center gap-8 rounded-sm border border-border-default p-8"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate tr-text-ui">{action.name}</p>
												<p className="truncate tr-text-metadata text-text-muted">{action.cwd}</p>
											</div>
											<IconButton
												size="s"
												icon={RiArrowUpLine}
												label={t("actions.moveUp")}
												disabled={busy || !connected || index === 0}
												onClick={() => reorder(index, -1)}
											/>
											<IconButton
												size="s"
												icon={RiArrowDownLine}
												label={t("actions.moveDown")}
												disabled={busy || !connected || index === snapshot.actions.length - 1}
												onClick={() => reorder(index, 1)}
											/>
											<Button
												size="s"
												variant="outline"
												disabled={busy || !connected || running}
												onClick={() => edit(action)}
											>
												{t("common.edit")}
											</Button>
											<IconButton
												size="s"
												icon={RiDeleteBinLine}
												label={t("actions.remove")}
												disabled={busy || !connected || running}
												onClick={() =>
													save(
														snapshot.actions.filter((entry) => entry.id !== action.id),
														snapshot.revision,
													)
												}
											/>
										</div>
									);
								})}
							</div>
							<Button
								variant="outline"
								iconLeft={RiAddLine}
								disabled={busy || !connected || !loaded || snapshot.actions.length >= 100}
								data-testid="action-add"
								onClick={() => edit(newAction(project))}
							>
								{t("actions.add")}
							</Button>
						</>
					)}
				</DialogContent>
			</Dialog>
			<Dialog
				open={selectedRun !== undefined}
				onOpenChange={(open) => {
					if (!open) setViewRunId(null);
				}}
			>
				<DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{selectedRun?.name ?? t("actions.logs")}</DialogTitle>
						<DialogDescription>{t("actions.runDescription")}</DialogDescription>
					</DialogHeader>
					{selectedRun ? (
						<RunDetails
							run={selectedRun}
							connected={connected}
							onStop={() => {
								void stop(selectedRun);
							}}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
