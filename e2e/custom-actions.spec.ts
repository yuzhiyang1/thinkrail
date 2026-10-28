import { expect, test } from "@playwright/test";
import { openFixtureProject } from "./fixtures/app";
import { resolveBunExecutable } from "./fixtures/executables";
import { E2E_FIXTURE_REPO } from "./fixtures/paths";
import { E2eWire } from "./fixtures/wire";

const program = resolveBunExecutable();

test("custom action buttons support multiple projects, configuration, execution and reload", async ({
	page,
}) => {
	await openFixtureProject(page);
	await page.getByTestId("manage-actions").click();
	await page.getByTestId("action-add").click();
	await page.getByTestId("action-name").fill("Orders · dev");
	await page.getByTestId("action-program").fill(program);
	await page.getByTestId("action-cwd").fill(E2E_FIXTURE_REPO);
	await page.getByTestId("action-args").fill("-e\nconsole.log('test-pipeline-triggered')");
	await page.getByTestId("action-resultUrl").fill("https://example.com/pipelines/orders");
	await page.getByTestId("action-save").click();
	await expect(page.getByTestId("action-editor")).toHaveCount(0);
	await page.getByTestId("action-add").click();
	await page.getByTestId("action-name").fill("Users · dev");
	await page.getByTestId("action-program").fill(program);
	await page.getByTestId("action-cwd").fill(E2E_FIXTURE_REPO);
	await page.getByTestId("action-args").fill("-e\nconsole.log('users')");
	await page.getByTestId("action-save").click();
	await expect(page.getByTestId("action-editor")).toHaveCount(0);
	await expect(
		page.getByTestId("custom-actions-dialog").locator('[data-testid^="action-config-"]'),
	).toHaveCount(2);
	await page.keyboard.press("Escape");
	const bar = page.getByTestId("custom-action-bar");
	await bar.getByRole("button", { name: "Orders · dev", exact: true }).click();
	await expect(page.getByTestId("action-run-status")).toHaveAttribute("data-status", "succeeded");
	await expect(page.getByTestId("action-run-output")).toContainText("test-pipeline-triggered");
	await expect(page.getByRole("link", { name: "Open pipeline / result" })).toHaveAttribute(
		"href",
		"https://example.com/pipelines/orders",
	);
	await page.keyboard.press("Escape");
	await page.reload();
	await expect(bar.getByRole("button", { name: "Orders · dev", exact: true })).toBeVisible();
	await expect(bar.getByRole("button", { name: "Users · dev", exact: true })).toBeVisible();
	await page.getByTestId("manage-actions").click();
	const rows = page.getByTestId("custom-actions-dialog").locator('[data-testid^="action-config-"]');
	await rows.nth(1).getByRole("button", { name: "Move up", exact: true }).click();
	await expect(rows.first()).toContainText("Users · dev");
	await rows.first().getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByTestId("action-name").fill("Users · test deployment");
	await page.getByTestId("action-save").click();
	await expect(page.getByTestId("action-editor")).toHaveCount(0);
	await expect(rows.first()).toContainText("Users · test deployment");
	await rows.first().getByRole("button", { name: "Remove action", exact: true }).click();
	await expect(rows).toHaveCount(1);
});

test("project visibility, stopping and Chinese UI work without an agent", async ({ page }) => {
	await openFixtureProject(page);
	const wire = await E2eWire.connect(Number(new URL(page.url()).port));
	try {
		const projects = await wire.request("project.list", {});
		const project = projects[0];
		if (!project) throw new Error("Missing fixture project");
		const catalog = await wire.request("action.list", {});
		await wire.request("action.save", {
			revision: catalog.revision,
			actions: [
				{
					id: "scoped-action",
					name: "Scoped deployment",
					program,
					args: ["-e", "setInterval(() => console.log('working'), 100)"],
					cwd: E2E_FIXTURE_REPO,
					projectId: project.id,
					timeoutSeconds: 30,
					resultUrl: "",
				},
				{
					id: "other-project",
					name: "Hidden deployment",
					program,
					args: ["-e", "console.log('wrong project')"],
					cwd: E2E_FIXTURE_REPO,
					projectId: "another-project",
					timeoutSeconds: 30,
					resultUrl: "",
				},
			],
		});
		await expect(
			page
				.getByTestId("custom-action-bar")
				.getByRole("button", { name: "Scoped deployment", exact: true }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Hidden deployment", exact: true })).toHaveCount(
			0,
		);
		await page
			.getByTestId("custom-action-bar")
			.getByRole("button", { name: "Scoped deployment", exact: true })
			.click();
		await expect(page.getByTestId("action-run-output")).toContainText("working");
		await page.getByRole("button", { name: "Stop local command", exact: true }).click();
		await expect(page.getByTestId("action-run-status")).toHaveAttribute("data-status", "cancelled");
		await page.keyboard.press("Escape");
		await wire.request("settings.update", { config: { locale: "zh-CN" } });
		await expect(page.getByTestId("manage-actions")).toHaveAttribute("aria-label", "自定义操作");
		await page.getByTestId("manage-actions").click();
		await expect(page.getByTestId("action-add")).toHaveText("添加操作");
	} finally {
		await wire.request("settings.update", { config: { locale: "en" } });
		wire.close();
	}
});
