import { expect, test, type Page } from '@playwright/test';

const headers = { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' };

async function openHostedAi(page: Page) {
  await page.route('**/api/ai/session', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ token: 'fixture-session', expiresAt: Date.now() + 3_600_000 }),
  }));
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await page.goto('/#/settings#settings-ai');
  await page.getByRole('radio', { name: 'Built-in AI' }).click();
  await page.getByRole('switch', { name: 'Enable AI' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'AI conversation' })).toBeVisible();
  await page.getByLabel('Access code').fill('fixture-access-code-with-at-least-thirty-two-characters');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('Built-in AI connected')).toBeVisible();
  return page.getByRole('textbox', { name: 'Message AI' });
}

test('hosted AI answers, approves one local write and survives reload', async ({ page }) => {
  let inferenceCalls = 0;
  await page.route('**/api/ai/inference', async (route) => {
    const request = route.request().postDataJSON() as { step: number; messages: { role: string; content?: string }[] };
    inferenceCalls += 1;
    const content = request.messages.findLast((message) => message.role === 'user')?.content ?? '';
    const events = content.includes('Create')
      ? request.step === 0
        ? [{ type: 'tool_call', callId: 'create-course-1', name: 'lacuna.create_course', input: { name: 'Hosted biology acceptance' } },
          { type: 'completed', finishReason: 'tool_calls' }]
        : [{ type: 'text_delta', text: 'The course is ready.' }, { type: 'completed', finishReason: 'stop' }]
      : [{ type: 'text_delta', text: 'The testing effect improves later recall.' },
        { type: 'completed', finishReason: 'stop' }];
    await route.fulfill({ status: 200, headers, body: events.map((event) => JSON.stringify(event)).join('\n') + '\n' });
  });
  const composer = await openHostedAi(page);
  await composer.fill('Explain the testing effect.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('The testing effect improves later recall.')).toBeVisible();

  await composer.fill('Create a course.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('article', { name: 'Completed action: Created Hosted biology acceptance' })).toBeVisible();
  await expect(page.getByText('The course is ready.')).toBeVisible();
  expect(inferenceCalls).toBe(3);

  await page.reload();
  await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page.getByText('The course is ready.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Completed action: Created Hosted biology acceptance' })).toBeVisible();
});

test('quota failure keeps the message available and ordinary study open', async ({ page }) => {
  await page.route('**/api/ai/inference', (route) => route.fulfill({ status: 429, body: 'Limit reached' }));
  const composer = await openHostedAi(page);
  await composer.fill('Explain my cards.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('AI limit reached. Try again later.')).toBeVisible();
  await expect(composer).toHaveValue('Explain my cards.');
  await page.goto('/#/dashboard');
  await expect(page.getByRole('main')).toBeVisible();
});

test('a rejected hosted write creates no receipt and cannot execute', async ({ page }) => {
  let continuation: unknown;
  await page.route('**/api/ai/inference', async (route) => {
    const request = route.request().postDataJSON() as { step: number; messages: unknown[] };
    if (request.step === 1) continuation = request.messages.at(-1);
    const events = request.step === 0
      ? [{ type: 'tool_call', callId: 'rejected-course-1', name: 'lacuna.create_course', input: { name: 'Rejected hosted course' } },
        { type: 'completed', finishReason: 'tool_calls' }]
      : [{ type: 'text_delta', text: 'No course was created.' }, { type: 'completed', finishReason: 'stop' }];
    await route.fulfill({ status: 200, headers, body: events.map((event) => JSON.stringify(event)).join('\n') + '\n' });
  });
  const composer = await openHostedAi(page);
  await composer.fill('Create a course that I will reject.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('No course was created.')).toBeVisible();
  expect(continuation).toMatchObject({ role: 'tool_result', result: { ok: false } });
  await expect(page.getByRole('article', { name: /Completed action:/ })).toHaveCount(0);
});

test('a hosted read uses the local catalogue and grounded course result', async ({ page }) => {
  const results: unknown[] = [];
  await page.route('**/api/ai/inference', async (route) => {
    const request = route.request().postDataJSON() as { step: number; messages: unknown[] };
    if (request.step > 0) results.push(request.messages.at(-1));
    const events = request.step === 0
      ? [{ type: 'tool_call', callId: 'catalogue-1', name: 'lacuna.list_tools', input: { query: 'find_course', limit: 5 } },
        { type: 'completed', finishReason: 'tool_calls' }]
      : request.step === 1
        ? [{ type: 'tool_call', callId: 'find-course-1', name: 'lacuna.find_course', input: { query: 'Welcome to Lacuna' } },
          { type: 'completed', finishReason: 'tool_calls' }]
        : [{ type: 'text_delta', text: 'I found Welcome to Lacuna in your local courses.' },
          { type: 'completed', finishReason: 'stop' }];
    await route.fulfill({ status: 200, headers, body: events.map((event) => JSON.stringify(event)).join('\n') + '\n' });
  });
  const composer = await openHostedAi(page);
  await composer.fill('Find my Welcome course.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('I found Welcome to Lacuna in your local courses.')).toBeVisible();
  expect(results).toHaveLength(2);
  expect(results[0]).toMatchObject({ role: 'tool_result', result: { ok: true } });
  expect(results[1]).toMatchObject({ role: 'tool_result', result: { ok: true } });
});

test('Stop fences a late provider response', async ({ page }) => {
  let answer!: () => void;
  const blocked = new Promise<void>((resolve) => { answer = resolve; });
  let received!: () => void;
  const requested = new Promise<void>((resolve) => { received = resolve; });
  await page.route('**/api/ai/inference', async (route) => {
    received();
    await blocked;
    await route.fulfill({ status: 200, headers,
      body: '{"type":"text_delta","text":"Late reply"}\n{"type":"completed","finishReason":"stop"}\n' }).catch(() => undefined);
  });
  const composer = await openHostedAi(page);
  await composer.fill('Start and then stop.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await requested;
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  answer();
  await expect(page.getByText('Response stopped').first()).toBeVisible();
  await expect(page.getByText('Late reply')).toHaveCount(0);
});

test('Stop during approval prevents the hosted write', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/ai/inference', async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, headers, body:
      '{"type":"tool_call","callId":"stopped-write-1","name":"lacuna.create_course","input":{"name":"Stopped hosted course"}}\n' +
      '{"type":"completed","finishReason":"tool_calls"}\n' });
  });
  const composer = await openHostedAi(page);
  await composer.fill('Create a course and wait for approval.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('article', { name: /Completed action:/ })).toHaveCount(0);
  expect(calls).toBe(1);
});

test('provider failure after a committed write never repeats the mutation', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/ai/inference', async (route) => {
    calls += 1;
    const request = route.request().postDataJSON() as { step: number };
    if (request.step === 1) {
      await route.fulfill({ status: 503, body: 'Provider unavailable' });
      return;
    }
    await route.fulfill({ status: 200, headers, body:
      '{"type":"tool_call","callId":"committed-write-1","name":"lacuna.create_course","input":{"name":"Committed hosted course"}}\n' +
      '{"type":"completed","finishReason":"tool_calls"}\n' });
  });
  const composer = await openHostedAi(page);
  await composer.fill('Create a course.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('article', { name: 'Completed action: Created Committed hosted course' })).toBeVisible();
  await expect(page.getByText('Built-in AI is unavailable. Try again later.')).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.getByRole('article', { name: 'Completed action: Created Committed hosted course' })).toHaveCount(1);
  await expect(composer).toHaveValue('');
});

test('another browser tab cannot own the same hosted conversation', async ({ page, context }) => {
  await page.route('**/api/ai/inference', (route) => route.fulfill({ status: 200, headers,
    body: '{"type":"text_delta","text":"Ready"}\n{"type":"completed","finishReason":"stop"}\n' }));
  await openHostedAi(page);
  const second = await context.newPage();
  await second.goto('/#/settings#settings-ai');
  await second.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(second.getByText('Built-in AI is open in another tab.')).toBeVisible();
  await expect(second.getByRole('textbox', { name: 'Message AI' })).toBeDisabled();
  await second.close();
});
