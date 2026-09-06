import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open sample workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Study desk", exact: true }),
  ).toBeVisible();
}
async function boot(page: import("@playwright/test").Page) {
  const b = await (await page.request.get("/api/bootstrap")).json();
  return {
    b,
    headers: {
      origin: "http://127.0.0.1:3000",
      "x-reviewer-request": "1",
      "x-csrf-token": b.user.csrf,
    },
  };
}
test("desktop practice, disclosure, streak, resume and accessible interface", async ({
  page,
}) => {
  await login(page);
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  let audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await expect(page.getByLabel("Questions", { exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: /^Start practice/ }).click();
  await expect(page.locator(".question-prompt")).toBeVisible();
  const activeUrl = page.url();
  await page.getByRole("button", { name: "Study desk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Continue", exact: true }),
  ).toBeVisible();
  await page.locator(".continue-row").click();
  await expect(page.locator(".question-prompt")).toBeVisible();
  expect(page.url()).toBe(activeUrl);
  for (let n = 0; n < 5; n++) {
    await page.locator(".choice").first().click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(
      page.getByRole("button", { name: "Reveal reasoning" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Technical explanation" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Reveal reasoning" }).click();
    await expect(
      page.getByRole("heading", { name: "Technical explanation" }),
    ).toBeVisible();
    if (n === 0) {
      await page.screenshot({
        path: "test-results/desktop-question.png",
        fullPage: true,
      });
      audit = await new AxeBuilder({ page }).analyze();
      expect(audit.violations).toEqual([]);
    }
    if (n < 4)
      await page
        .getByRole("button", { name: "Next question", exact: true })
        .click();
  }
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish & review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-results.png",
    fullPage: true,
  });
  const url = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  const { b } = await boot(page);
  expect(b.streak.current).toBe(1);
  expect(b.streak.todayCount).toBe(5);
  expect(b.stats.completed).toBe(1);
});
test("owner stages, publishes and rolls back an immutable content release", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Question bank" }).click();
  await page.getByRole("button", { name: "Edit active release" }).click();
  const textarea = page.getByLabel("Question data");
  const payload = JSON.parse(await textarea.inputValue());
  payload.release_label = "v7-review.2";
  payload.questions[0].explanation_eli5 =
    "Give someone only the keys required for their work.";
  await textarea.fill(JSON.stringify(payload));
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save reviewed draft" }).click();
  await expect(
    page.getByRole("button", { name: "Publish release" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish release" }).click();
  await page
    .getByRole("button", { name: "Activate release", exact: true })
    .click();
  await expect(page.locator(".bank-summary h2")).toHaveText("v7-review.2");
  await page.getByRole("button", { name: "Restore release" }).click();
  await page
    .getByRole("button", { name: "Activate release", exact: true })
    .click();
  await expect(page.locator(".bank-summary h2")).toHaveText("v7-sample.1");
  await page.screenshot({
    path: "test-results/content-workbench.png",
    fullPage: true,
  });
});
test("server rejects cross-user access, forged fields, premature disclosure and cross-origin mutations", async ({
  page,
  browser,
}) => {
  await login(page);
  const { headers } = await boot(page);
  const res = await page.request.post("/api/attempts", {
    headers,
    data: {
      mode: "mock",
      category: "",
      count: 3,
      disclosure: "automatic",
      minutes: 10,
      preferUnseen: false,
      requestId: crypto.randomUUID(),
    },
  });
  expect(res.ok()).toBe(true);
  const a = await res.json();
  expect(JSON.stringify(a)).not.toContain("correct_choice_id");
  const answerData = {
    index: 0,
    choice: a.items[0].choices[0].id,
    guessed: false,
  };
  const answered = await page.request.post(`/api/attempts/${a.id}/answer`, {
    headers,
    data: answerData,
  });
  expect(answered.ok()).toBe(true);
  expect((await answered.json()).items[0].correct).toBeNull();
  const reveal = await page.request.post(`/api/attempts/${a.id}/reveal`, {
    headers,
    data: { index: 0 },
  });
  expect(reveal.status()).toBe(403);
  const exported = await (await page.request.get("/api/export")).json();
  expect(JSON.stringify(exported)).not.toContain("correct_choice_id");
  const tamper = await page.request.post(`/api/attempts/${a.id}/answer`, {
    headers,
    data: { ...answerData, score: 100, userId: "another" },
  });
  expect(tamper.status()).toBe(400);
  const csrf = await page.request.post(`/api/attempts/${a.id}/finish`, {
    headers: { ...headers, origin: "https://evil.invalid" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other);
  const stolen = await other.request.get(`/api/attempts/${a.id}`);
  expect(stolen.status()).toBe(404);
  await context.close();
});
test("concurrent saves are idempotent and sample session data survives refresh", async ({
  page,
}) => {
  await login(page);
  const { headers } = await boot(page);
  const a = await (
    await page.request.post("/api/attempts", {
      headers,
      data: {
        mode: "mixed",
        category: "",
        count: 5,
        disclosure: "on-demand",
        minutes: 10,
        preferUnseen: false,
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      page.request.post(`/api/attempts/${a.id}/answer`, {
        headers,
        data: { index: 0, choice: a.items[0].choices[0].id, guessed: false },
      }),
    ),
  );
  expect(responses.every((r) => r.ok())).toBe(true);
  expect((await boot(page)).b.streak.todayCount).toBe(1);
  await page.reload();
  expect((await boot(page)).b.streak.todayCount).toBe(1);
});
test("mobile layout, keyboard focus and settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Questions", { exact: true }).fill("3");
  await page.getByRole("button", { name: /^Start practice/ }).click();
  await expect(page.locator(".question-prompt")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-question.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole("button", { name: "Study desk", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your name").fill("Local learner");
  await page.getByLabel("Daily question target").fill("8");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Study preferences saved.")).toBeVisible();
  expect((await boot(page)).b.profile.dailyTarget).toBe(8);
  await page
    .getByRole("button", { name: "Sign out of this workspace" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open sample workspace" }),
  ).toBeVisible();
});

test("inline reasoning, preserved drafts, review filters and reachable navigation", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: /^Start practice/ }).click();
  await expect(page.locator(".question-prompt")).toBeVisible();
  await page.locator(".choice").first().click();
  const choice = await page
    .locator('input[name="answer"]:checked')
    .inputValue();
  await page.getByRole("checkbox", { name: "Uncertain", exact: true }).check();
  await page.getByRole("button", { name: "Flag", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Flagged", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('input[name="answer"]:checked')).toHaveValue(
    choice,
  );
  await expect(
    page.getByRole("checkbox", { name: "Uncertain", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Next question", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal reasoning", exact: true })
    .click();
  const answerBlock = page
    .locator(".answer-block")
    .filter({ has: page.locator("input:checked") });
  await expect(answerBlock.locator(".inline-reasoning")).toBeVisible();
  const technical = await answerBlock
    .locator(".inline-reasoning > p")
    .innerText();
  await page.getByRole("button", { name: "ELI5", exact: true }).click();
  await expect(answerBlock.locator(".inline-reasoning > p")).not.toHaveText(
    technical,
  );
  await page.getByRole("button", { name: "Technical", exact: true }).click();
  await page.getByLabel("Show questions").selectOption("unanswered");
  await expect(page.locator(".session-map button")).toHaveCount(4);
  await page.getByRole("button", { name: /^Review/ }).click();
  await expect(page.locator(".session-map button")).toHaveCount(1);
  await expect(
    page.locator(".session-map button").first(),
  ).toHaveAccessibleName(/uncertain, flagged/);
  await page
    .getByRole("button", { name: "Continue to next question", exact: true })
    .click();
  await expect(page.locator(".question-position strong")).toHaveText("02");
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await expect(page.locator(".question-position strong")).toHaveText("01");
  await page.setViewportSize({ width: 390, height: 700 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const nav = await page
    .getByRole("button", { name: "Next question", exact: true })
    .boundingBox();
  expect(nav!.y).toBeGreaterThanOrEqual(58);
  expect(nav!.y + nav!.height).toBeLessThan(700);
  const dock = await page
    .getByRole("button", { name: "Continue to next question", exact: true })
    .boundingBox();
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(700);
  await page.screenshot({
    path: "test-results/mobile-reasoning.png",
    fullPage: false,
  });
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});

test("mock edits stay private until finishing in the focus workspace", async ({
  page,
}) => {
  await login(page);
  const { headers } = await boot(page);
  const a = await (
    await page.request.post("/api/attempts", {
      headers,
      data: {
        mode: "mock",
        category: "",
        count: 3,
        disclosure: "automatic",
        minutes: 10,
        preferUnseen: false,
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  await page.goto(`/?view=practice&attempt=${a.id}`);
  await expect(page.getByLabel("Time remaining")).toBeVisible();
  await page.locator(".choice").first().click();
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Continue to next question",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".inline-reasoning, .inline-reveal")).toHaveCount(
    0,
  );
  await expect(
    page.locator(".session-map .right, .session-map .wrong"),
  ).toHaveCount(0);
  await page.locator(".choice").nth(1).click();
  await page.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(page.locator('input[name="answer"]:checked')).toHaveValue(
    a.items[0].choices[1].id,
  );
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish & review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".inline-reasoning")).toBeVisible();
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(
    page
      .locator(".answer-block")
      .filter({ has: page.locator(".choice.correct") })
      .locator(".inline-reasoning"),
  ).toBeVisible();
  await expect(page.locator(".session-score")).toContainText("2 unanswered");
  await expect(
    page.getByRole("button", { name: "New session", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("preferences preserve identity, sessions, answers, bookmarks and activity after reload", async ({
  page,
  browser,
}) => {
  await login(page);
  await expect(page.locator(".topbar")).toHaveCount(0);
  const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  await expect(icon).toHaveCount(1);
  expect(
    (await page.request.get((await icon.getAttribute("href"))!)).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: /^Start practice/ }).click();
  await expect(page.locator(".question-prompt")).toBeVisible();
  await page.locator(".choice").first().click();
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Flag", exact: true }).click();
  await page.getByRole("button", { name: "Study desk", exact: true }).click();
  const before = (await boot(page)).b;
  const snapshot = await (
    await page.request.get(`/api/attempts/${before.attempts[0].id}`)
  ).json();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your name").fill("Persistence check");
  await page.getByLabel("Daily question target").fill("12");
  await page.getByLabel("Default answer feedback").selectOption("automatic");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Study preferences saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your name")).toHaveValue("Persistence check");
  await expect(page.getByLabel("Daily question target")).toHaveValue("12");
  const after = (await boot(page)).b;
  expect(after.user.id).toBe(before.user.id);
  for (const field of ["attempts", "bookmarks", "activity", "stats", "release"])
    expect(after[field]).toEqual(before[field]);
  expect(
    await (
      await page.request.get(`/api/attempts/${before.attempts[0].id}`)
    ).json(),
  ).toEqual(snapshot);
  // A new browser process context with the same cookie must open the same workspace.
  const reopened = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  try {
    const tab = await reopened.newPage();
    await tab.goto("/");
    await expect(
      tab.getByRole("heading", { name: "Study desk", exact: true }),
    ).toBeVisible();
    expect((await boot(tab)).b.user.id).toBe(before.user.id);
    expect((await boot(tab)).b.attempts).toEqual(before.attempts);
  } finally {
    await reopened.close();
  }
});

test("loopback navigation and reopening demo preserve the current workspace", async ({
  page,
}) => {
  await login(page);
  const { b: before, headers } = await boot(page);
  const reopened = await page.request.post("/api/auth/demo", {
    headers,
    data: {},
  });
  expect(reopened.ok()).toBe(true);
  expect((await boot(page)).b.user.id).toBe(before.user.id);
  await page.goto("http://localhost:3000/?view=settings");
  await expect(page).toHaveURL("http://127.0.0.1:3000/?view=settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  expect((await boot(page)).b.user.id).toBe(before.user.id);
  await page.getByLabel("Your name").fill("Remembered workspace");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Study preferences saved.")).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out of this workspace" })
    .click();
  await page.getByRole("button", { name: "Open sample workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Study desk", exact: true }),
  ).toBeVisible();
  expect((await boot(page)).b.user.id).toBe(before.user.id);
  expect((await boot(page)).b.profile.name).toBe("Remembered workspace");
});
// Capture a cleanup item for browser spec module
