export interface CustomAction {
	id: string;
	name: string;
	program: string;
	args: string[];
	cwd: string;
	projectId: string | null;
	timeoutSeconds: number;
	resultUrl: string;
}

export interface CustomActionCatalog {
	revision: string;
	actions: CustomAction[];
}

export type CustomActionStatus = "running" | "succeeded" | "failed" | "timed-out" | "cancelled";

export interface CustomActionRun {
	id: string;
	actionId: string;
	name: string;
	program: string;
	args: string[];
	cwd: string;
	resultUrl: string;
	status: CustomActionStatus;
	startedAt: number;
	finishedAt: number | null;
	exitCode: number | null;
	output: string;
	truncated: boolean;
}

export interface CustomActionsSnapshot extends CustomActionCatalog {
	runs: CustomActionRun[];
}
