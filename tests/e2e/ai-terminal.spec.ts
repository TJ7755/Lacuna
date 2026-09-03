import { expect, test } from '@playwright/test';
import { TerminalAiClient } from '../../tooling/lacuna-ai-mcp/src/client.js';
import {
  connectTerminal,
  pairBrowserAndTerminal,
  pairingCodeFrom,
  type BrowserPutRecord,
} from './fixtures/aiRelay.js';

test('pairs with a terminal and exchanges an encrypted reply', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(terminal.waitForMessage(250)).resolves.toEqual({ type: 'empty' });
  }

  await composer.fill('Explain the testing effect.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(2_000);
  expect(claimed).toEqual(
    expect.objectContaining({
      type: 'message',
      content: 'Explain the testing effect.',
    }),
  );
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');

  const reply = 'Retrieval strengthens later access more than passive rereading.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);

  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await terminal.disconnect();
  await expect(page.getByText('Explain the testing effect.', { exact: true })).toBeVisible();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect AI client' })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
});

test('creates a complete authored course through approved AI tools', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  const prompt =
    'Create a short algebra course with a lesson, a card, a fixed Question and an assessment.';

  await composer.fill(prompt);
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(2_000);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');

  const courseInput = { name: 'AI Algebra acceptance' };
  const courseResponsePromise = terminal.invokeTool(
    claimed.runId,
    'create-course',
    'lacuna.create_course',
    courseInput,
  );
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  const courseResponse = await courseResponsePromise;
  const course = successfulToolRecord(courseResponse);
  const courseId = requiredString(course, 'id');
  await expect(
    page.getByRole('article', { name: 'Completed action: Created AI Algebra acceptance' }),
  ).toBeVisible();

  const lessonInput = { courseId, name: 'Linear equations' };
  const lessonResponsePromise = terminal.invokeTool(
    claimed.runId,
    'create-lesson',
    'lacuna.create_lesson',
    lessonInput,
  );
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  const lessonResponse = await lessonResponsePromise;
  const lessonId = requiredString(successfulToolRecord(lessonResponse), 'id');

  const conceptResponse = await terminal.invokeTool(
    claimed.runId,
    'create-concept',
    'lacuna.create_concept',
    { courseId, name: 'Solve linear equations' },
  );
  const conceptId = requiredString(successfulToolRecord(conceptResponse), 'id');

  const cardResponse = await terminal.invokeTool(
    claimed.runId,
    'create-card',
    'lacuna.create_card',
    {
      courseId,
      lessonId,
      type: 'front_back',
      front: 'What operation isolates x in x + 4 = 9?',
      back: 'Subtract 4 from both sides.',
    },
  );
  const cardId = requiredString(successfulToolRecord(cardResponse), 'id');

  const questionResponse = await terminal.invokeTool(
    claimed.runId,
    'create-question',
    'lacuna.create_fixed_question',
    {
      courseId,
      primaryLessonId: lessonId,
      name: 'Solve a linear equation',
      prompt: 'Solve 2x + 1 = 7.',
      explanation: 'Subtract one, then divide by two.',
      payload: { kind: 'numeric', answer: { kind: 'exact', value: '3' } },
      targetConceptId: conceptId,
    },
  );
  const questionResult = successfulToolRecord(questionResponse);
  const question = requiredRecord(questionResult, 'question');
  const questionId = requiredString(question, 'id');

  const assessmentInput = {
    courseId,
    name: 'Algebra checkpoint',
    examDate: Date.UTC(2027, 4, 12, 9),
    timeZone: 'Europe/London',
    afterLessonId: lessonId,
    coverageMode: 'prefix' as const,
  };
  const assessmentResponse = await terminal.invokeTool(
    claimed.runId,
    'create-assessment',
    'lacuna.create_course_assessment',
    assessmentInput,
  );
  const assessmentId = requiredString(successfulToolRecord(assessmentResponse), 'id');
  const assessmentReplay = await terminal.invokeTool(
    claimed.runId,
    'create-assessment',
    'lacuna.create_course_assessment',
    assessmentInput,
  );
  expect(assessmentReplay).toEqual(assessmentResponse);

  await expect(page.getByRole('link', { name: 'Open lesson Linear equations' })).toHaveAttribute(
    'href',
    `#/course/${courseId}/lesson/${lessonId}`,
  );
  await expect(
    page.getByRole('link', {
      name: 'Open card What operation isolates x in x + 4 = 9?',
    }),
  ).toHaveAttribute('href', `#/course/${courseId}/cards/${cardId}/edit`);
  await expect(
    page.getByRole('link', { name: 'Open question Solve a linear equation' }),
  ).toHaveAttribute('href', `#/course/${courseId}/questions/${questionId}/edit`);
  await expect(
    page.getByRole('link', { name: 'Open assessment Algebra checkpoint' }),
  ).toHaveAttribute('href', `#/course/${courseId}/settings#course-settings-assessments`);

  await expectToolListCount(terminal, claimed.runId, 'list-lessons', 'lacuna.list_lessons', {
    courseId,
  });
  await expectToolListCount(terminal, claimed.runId, 'list-cards', 'lacuna.list_cards', {
    courseId,
  });
  await expectToolListCount(terminal, claimed.runId, 'list-questions', 'lacuna.list_questions', {
    courseId,
  });
  // A Course starts with its Final exam; replay must add only the one requested checkpoint.
  await expectToolListCount(
    terminal,
    claimed.runId,
    'list-assessments',
    'lacuna.list_course_assessments',
    { courseId },
    2,
  );
  expect(assessmentId).not.toBe('');

  const reply = 'Created the algebra course and its authored learning material.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await terminal.disconnect();
});

test('carries misconception-first instructions through a memory-guided teaching exchange', async ({
  page,
}) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  await composer.fill('Remember that I think division distributes over addition.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const memoryRun = await terminal.waitForMessage(2_000);
  if (memoryRun.type !== 'message') throw new Error('Expected the memory request.');
  expect(memoryRun.instructions).toMatchObject({
    instructionVersion: 'teaching-v1',
    misconceptionFirstEnabled: true,
  });

  const courses = successfulToolArray(
    await terminal.invokeTool(memoryRun.runId, 'list-courses-memory', 'lacuna.list_courses', {}),
  );
  const course = arrayRecord(courses, 0);
  const courseId = requiredString(course, 'id');
  const createInput = {
    scope: { kind: 'course' as const, courseId },
    tags: ['misconception'] as const,
    status: 'uncertain' as const,
    content: 'Division distributes over addition.',
    basis: 'learner-stated' as const,
  };
  const memoryPromise = terminal.invokeTool(
    memoryRun.runId,
    'create-memory',
    'lacuna.create_memory',
    createInput,
  );
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  const memory = successfulToolRecord(await memoryPromise);
  const memoryId = requiredString(memory, 'id');
  const memoryReply = 'I saved that as uncertain context.';
  await terminal.reply(memoryRun.runId, memoryRun.messageId, memoryReply);
  await expect(page.getByText(memoryReply, { exact: true })).toBeVisible();

  await composer.fill('Why does division not distribute over addition?');
  await page.getByRole('button', { name: 'Send message' }).click();
  const teachingRun = await terminal.waitForMessage(2_000);
  if (teachingRun.type !== 'message') throw new Error('Expected the conceptual request.');
  expect(teachingRun.instructions.content).toContain('create a concrete failed prediction');
  const relevant = successfulToolArray(
    await terminal.invokeTool(teachingRun.runId, 'search-memory', 'lacuna.search_memories', {
      scope: { kind: 'course', courseId },
      query: 'division addition',
      statuses: ['active', 'uncertain'],
    }),
  );
  expect(relevant).toHaveLength(1);
  expect(requiredString(arrayRecord(relevant, 0), 'id')).toBe(memoryId);
  await terminal.reply(
    teachingRun.runId,
    teachingRun.messageId,
    'Test your model first: compare 12 ÷ (2 + 4) with (12 ÷ 2) + (12 ÷ 4).',
  );
  await expect(page.getByText('Test your model first:', { exact: false })).toBeVisible();

  await composer.fill(
    'They are 2 and 9, so the model fails. It only distributes with multiplication.',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  const correctionRun = await terminal.waitForMessage(2_000);
  if (correctionRun.type !== 'message') throw new Error('Expected the correction evidence.');
  const transferPrompt =
    'Correct. Now test transfer: compare 18 ÷ (3 + 6) with (18 ÷ 3) + (18 ÷ 6).';
  await terminal.reply(correctionRun.runId, correctionRun.messageId, transferPrompt);
  await expect(page.getByText(transferPrompt, { exact: true })).toBeVisible();

  await composer.fill('They are 2 and 9, so division still does not distribute.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const transferRun = await terminal.waitForMessage(2_000);
  if (transferRun.type !== 'message') throw new Error('Expected the transfer result.');
  const resolved = successfulToolRecord(
    await terminal.invokeTool(transferRun.runId, 'resolve-memory', 'lacuna.update_memory', {
      memoryId,
      status: 'resolved',
      content:
        'The learner distinguished division from multiplication and transferred the correction to a new example.',
      basis: 'learner-stated',
    }),
  );
  expect(resolved.status).toBe('resolved');
  const finalReply = 'Correct. You transferred the rule to a new example.';
  await terminal.reply(transferRun.runId, transferRun.messageId, finalReply);
  await expect(page.getByText(finalReply, { exact: true })).toBeVisible();
  await terminal.disconnect();
});

test('recovers a claimed prompt through a dead terminal replacement', async ({ page }) => {
  const { composer, terminal, handleRelayRequest } = await pairBrowserAndTerminal(page);
  const prompt = 'Recover this prompt after the terminal disappears.';

  await composer.fill(prompt);
  await page.getByRole('button', { name: 'Send message' }).click();
  const abandonedClaim = await terminal.waitForMessage(2_000);
  expect(abandonedClaim).toEqual(expect.objectContaining({ type: 'message', content: prompt }));
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByRole('button', { name: 'Disconnect AI client' }).click();
  await expect(page.getByRole('button', { name: 'Connect AI client' })).toBeVisible();
  await expect(page.getByRole('article').getByText(prompt, { exact: true })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveValue(prompt);

  await page.getByRole('button', { name: 'Connect AI client' }).click();
  const replacementCode = await pairingCodeFrom(page);
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveValue(prompt);

  const replacement = await connectTerminal(
    handleRelayRequest,
    replacementCode,
    'Replacement Playwright terminal',
    'replacement',
  );
  await expect(composer).toBeEnabled();
  await expect(composer).toHaveValue(prompt);

  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(composer).toHaveValue('');
  const replacementClaim = await replacement.waitForMessage(2_000);
  expect(replacementClaim).toEqual(expect.objectContaining({ type: 'message', content: prompt }));
  if (replacementClaim.type !== 'message') {
    throw new Error('Expected the replacement terminal to claim the recovered prompt.');
  }

  const reply = 'The replacement terminal completed the recovered prompt.';
  await replacement.reply(replacementClaim.runId, replacementClaim.messageId, reply);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');

  await replacement.disconnect();
  await expect(page.getByRole('button', { name: 'Connect AI client' })).toBeVisible();
  await expect(page.getByRole('article').getByText(prompt, { exact: true })).toHaveCount(2);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveValue('');
});

test('recovers a committed browser write when Vercel strips the 200 acknowledgement', async ({
  page,
}) => {
  const browserPuts: BrowserPutRecord[] = [];
  const { composer, terminal } = await pairBrowserAndTerminal(page, {
    damageFirstBrowserPut: true,
    browserPuts,
  });

  await composer.fill('Keep this exchange after an ambiguous relay acknowledgement.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(2_000);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');

  const reply = 'The committed browser write was recovered safely.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);

  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');
  await expect(
    page.getByText(
      'Another Lacuna tab or window changed this AI connection. Reconnect the terminal.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      'The relay may have accepted this AI update, but Lacuna could not verify it. Reconnect the terminal.',
      { exact: true },
    ),
  ).toHaveCount(0);
  expect(browserPuts.length).toBeGreaterThanOrEqual(2);
  expect(browserPuts[0]?.attemptedGeneration).toBe('"0"');
  expect(browserPuts[1]?.attemptedGeneration).toBe(browserPuts[0]?.contentGeneration);
  expect(browserPuts[1]?.attemptedGeneration).not.toBe(browserPuts[0]?.committedGeneration);
  expect(new Set(browserPuts.map((put) => put.contentGeneration)).size).toBe(browserPuts.length);
  expect(browserPuts.map((put) => put.attemptedGeneration)).not.toContain('"vercel-platform"');

  await terminal.disconnect();
});

test('restores and claims an unclaimed message once after a browser reload', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  const message = 'Keep this pending through a reload.';

  await composer.fill(message);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(composer).toHaveValue('');
  await page.reload();
  const panel = page.getByRole('complementary', { name: 'AI conversation' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  }
  await expect(panel).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();

  const claimed = await terminal.waitForMessage(2_000);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(terminal.waitForMessage(250)).resolves.toEqual({ type: 'empty' });

  const reply = 'The pending run survived the reload.';
  await terminal.reply(claimed.runId, claimed.messageId, reply);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await terminal.disconnect();
});

test('acknowledges Stop and rejects a later domain tool call', async ({ page }) => {
  const { composer, terminal } = await pairBrowserAndTerminal(page);

  await composer.fill('Stop this terminal run.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const claimed = await terminal.waitForMessage(2_000);
  if (claimed.type !== 'message') throw new Error('Expected the terminal to claim the message.');
  expect(
    await terminal.invokeTool(claimed.runId, 'read-before-stop', 'lacuna.list_courses', {}),
  ).toMatchObject({ ok: true });

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(terminal.waitForMessage(2_000)).resolves.toEqual({
    type: 'stop_requested',
    messageId: claimed.messageId,
    runId: claimed.runId,
  });
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Further AI bridge actions are blocked. Completed changes remain.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    terminal.invokeTool(claimed.runId, 'read-after-stop', 'lacuna.list_courses', {}),
  ).rejects.toThrow('The supplied run is not active in this terminal session.');
  const lateReply = 'This late reply must not appear.';
  await expect(terminal.reply(claimed.runId, claimed.messageId, lateReply)).rejects.toThrow(
    'The supplied run and message are not active in this terminal session.',
  );
  await expect(page.getByText(lateReply, { exact: true })).toHaveCount(0);
  await terminal.disconnect();
});

type TerminalToolResponse = Awaited<ReturnType<TerminalAiClient['invokeTool']>>;

function successfulToolRecord(response: TerminalToolResponse): Record<string, unknown> {
  expect(response.ok).toBe(true);
  if (!response.ok || !response.result || typeof response.result !== 'object') {
    throw new Error('Expected the AI tool to return an object result.');
  }
  if (Array.isArray(response.result)) throw new Error('Expected an object, not an array.');
  return response.result;
}

function successfulToolArray(response: TerminalToolResponse): unknown[] {
  expect(response.ok).toBe(true);
  if (!response.ok || !Array.isArray(response.result)) {
    throw new Error('Expected the AI tool to return an array result.');
  }
  return response.result;
}

function arrayRecord(values: unknown[], index: number): Record<string, unknown> {
  const value = values[index];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected result ${index} to be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredRecord(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  if (!field || typeof field !== 'object' || Array.isArray(field)) {
    throw new Error(`Expected "${key}" to be an object.`);
  }
  return field as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field === '') {
    throw new Error(`Expected "${key}" to be a non-empty string.`);
  }
  return field;
}

async function expectToolListCount(
  terminal: TerminalAiClient,
  runId: string,
  callId: string,
  toolName: string,
  input: Record<string, string>,
  expectedCount = 1,
): Promise<void> {
  const response = await terminal.invokeTool(runId, callId, toolName, input);
  expect(response.ok).toBe(true);
  if (!response.ok || !Array.isArray(response.result)) {
    throw new Error(`Expected ${toolName} to return a list.`);
  }
  expect(response.result).toHaveLength(expectedCount);
}
