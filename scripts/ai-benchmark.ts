import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { buildAiInstructionBundle } from '../src/ai/instructions';
import { findCourseContract, searchCardsContract } from '../src/mcp/contracts/read';
import { listToolsContract } from '../src/mcp/contracts/registry';
import { AUDIT_FIXTURES, auditPrompt, type AuditFixture } from './ai-benchmark-fixtures';

const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;
const READ_TOOLS = [findCourseContract, searchCardsContract];
const MAX_OUTPUT_TOKENS = 768;
const MAX_STEPS = 9;
const SYSTEM = `${buildAiInstructionBundle({ misconceptionFirstEnabled: false }).content}\nHosted Lacuna tools\nThe available functions are lacuna_list_tools and lacuna_invoke_tool. Use lacuna_list_tools to discover domain tools and their inputs. Invoke domain tools through lacuna_invoke_tool with name and input. No web search is available. This benchmark uses synthetic data and permits reads only.`;
const outputSchema = z.object({ cards: z.array(z.object({
  cardId: z.string(),
  status: z.enum(['correct', 'error', 'ambiguous', 'duplicate', 'insufficient_evidence']),
  evidence: z.string(), correction: z.string(),
}).strict()) }).strict();

function normalise(value: string): string {
  return value.toLocaleLowerCase('en-GB').replace(/\s+/g, ' ').trim();
}

export function gradeAudit(fixture: AuditFixture, text: string) {
  const empty = { classifications: 0, expectedCards: fixture.cards.length, grounded: 0, corrections: 0,
    requiredCorrections: fixture.gold.filter((row) => row.correctionIncludes).length, complete: false };
  let parsed: z.infer<typeof outputSchema>;
  try { parsed = outputSchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))); }
  catch { return empty; }
  const rows = parsed.cards;
  if (new Set(rows.map((row) => row.cardId)).size !== rows.length) return empty;
  const evidence = normalise([fixture.source, ...fixture.cards.flatMap((card) => [card.front, card.back])].join('\n'));
  const matchingRows = fixture.gold.map((gold) => ({ gold, row: rows.find((row) => row.cardId === gold.cardId) }));
  return {
    ...empty,
    classifications: matchingRows.filter(({ gold, row }) => row?.status === gold.status).length,
    grounded: matchingRows.filter(({ row }) => row && normalise(row.evidence).length >= 10 && evidence.includes(normalise(row.evidence))).length,
    corrections: matchingRows.filter(({ gold, row }) => gold.correctionIncludes && row && normalise(row.correction).includes(gold.correctionIncludes)).length,
    complete: rows.length === fixture.cards.length && matchingRows.every(({ row }) => row),
  };
}

export function runFixtureTool(fixture: AuditFixture, name: string, input: unknown): unknown {
  if (name === 'lacuna.find_course') {
    const parsed = findCourseContract.inputSchema.parse(input);
    if (!['lumen', 'benchmark-lumen'].includes(normalise(parsed.query))) throw new Error('Unknown course.');
    return { data: { matches: [{ courseId: 'benchmark-lumen', name: 'Lumen', archived: false, lessonCount: 1, cardCount: fixture.cards.length }] } };
  }
  if (name === 'lacuna.search_cards') {
    const parsed = searchCardsContract.inputSchema.parse(input);
    if (!['lumen', 'benchmark-lumen'].includes(normalise(parsed.course))) throw new Error('Unknown course.');
    if (parsed.cursor !== undefined && parsed.cursor !== 'benchmark-page-2') throw new Error('Invalid cursor.');
    if (parsed.query) throw new Error('Read the complete course without a text filter.');
    const second = parsed.cursor === 'benchmark-page-2';
    return { data: { course: { courseId: 'benchmark-lumen', name: 'Lumen', archived: false },
      total: fixture.cards.length, topics: [], cards: fixture.cards.slice(second ? 2 : 0, second ? 4 : 2),
      ...(second ? {} : { nextCursor: 'benchmark-page-2' }) } };
  }
  throw new Error('Forbidden or unavailable tool. This benchmark permits only course lookup and card reads.');
}

async function main() {
  const { values } = parseArgs({ options: {
    repetitions: { type: 'string', default: '2' },
    out: { type: 'string', default: `artifacts/ai-benchmark/${new Date().toISOString().replace(/[:.]/g, '-')}.json` },
    'interval-ms': { type: 'string', default: '30000' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: bun --env-file=.env.groq.local scripts/ai-benchmark.ts [--repetitions 2] [--out path] [--dry-run]');
    return;
  }
  const repetitions = Number(values.repetitions);
  const intervalMs = Number(values['interval-ms']);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3 || !Number.isInteger(intervalMs) || intervalMs < 30000) {
    throw new Error('Use 1–3 repetitions and an interval of at least 30000 ms per model.');
  }
  const identity = createHash('sha256').update(JSON.stringify({ system: SYSTEM, fixtures: AUDIT_FIXTURES, maxOutputTokens: MAX_OUTPUT_TOKENS, maxSteps: MAX_STEPS })).digest('hex');
  if (values['dry-run']) {
    console.log(JSON.stringify({ models: MODELS, fixtures: AUDIT_FIXTURES.map(({ id, split, tools }) => ({ id, split, tools: !!tools })), repetitions,
      maximumRequests: MODELS.length * repetitions * AUDIT_FIXTURES.reduce((count, fixture) => count + (fixture.tools ? MAX_STEPS : 1), 0), identity }, null, 2));
    return;
  }
  if (!process.env.GROQ_API_KEY || process.env.GROQ_FREE_PLAN_CONFIRMED !== 'true') {
    throw new Error('A GROQ_API_KEY from a confirmed Groq Free-plan organisation and GROQ_FREE_PLAN_CONFIRMED=true are required. Paid plans and Gateway fallbacks are forbidden.');
  }
  const groq = createOpenAICompatible({ name: 'groq-benchmark', baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY });
  const results: Array<Record<string, unknown>> = [];
  const lastRequest = new Map<string, number>();
  const exhausted = new Set<string>();
  const outputPath = resolve(values.out);
  await mkdir(dirname(outputPath), { recursive: true });
  const save = async () => writeFile(outputPath, `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), provider: 'groq-free', models: MODELS,
    identity, repetitions, maxOutputTokens: MAX_OUTPUT_TOKENS, maxSteps: MAX_STEPS, intervalMs,
    limitations: 'Small synthetic benchmark; exact verdict, quotation and correction matching only. Does not establish broad subject accuracy or production capacity. Tool fixture validates real input schemas but uses a synthetic local read adapter, not the database or browser.', results }, null, 2)}\n`, { mode: 0o600 });
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const fixture of AUDIT_FIXTURES) {
      for (const model of MODELS) {
        if (exhausted.has(model)) continue;
        const startedAt = performance.now();
        const trace: Array<{ name: string; input: unknown; valid: boolean }> = [];
        const calls: Array<Record<string, unknown>> = [];
        const messages: ModelMessage[] = [{ role: 'user', content: auditPrompt(fixture) }];
        let text = '';
        let failure: string | undefined;
        let callStarted = 0;
        let activeCall: Record<string, unknown> | undefined;
        const tools = fixture.tools ? {
          lacuna_list_tools: tool({ description: listToolsContract.description,
            inputSchema: listToolsContract.inputSchema.extend({ limit: z.number().int().min(1).max(5).default(5) }) }),
          lacuna_invoke_tool: tool({ description: 'Invoke a Lacuna domain tool by its catalogue name and validated input. Lacuna resolves permissions locally.',
            inputSchema: z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) }).strict() }),
        } : undefined;
        try {
          for (let step = 0; step < (fixture.tools ? MAX_STEPS : 1); step += 1) {
            const wait = intervalMs - (Date.now() - (lastRequest.get(model) ?? 0));
            if (wait > 0) await new Promise((done) => setTimeout(done, wait));
            lastRequest.set(model, Date.now());
            callStarted = performance.now();
            activeCall = { step, finishReason: 'provider_error' };
            calls.push(activeCall);
            const result = await generateText({ model: groq.chatModel(model), system: SYSTEM, messages, tools,
              maxOutputTokens: MAX_OUTPUT_TOKENS, maxRetries: 0, temperature: 0.2, abortSignal: AbortSignal.timeout(30_000) });
            Object.assign(activeCall, { latencyMs: Math.round(performance.now() - callStarted), finishReason: result.finishReason, usage: result.totalUsage });
            text = result.text;
            if (!result.toolCalls.length) break;
            messages.push(...result.response.messages);
            for (const call of result.toolCalls) {
              let output: unknown;
              let valid = true;
              let name = call.toolName;
              let input: unknown = call.input;
              try {
                if (call.toolName === 'lacuna_list_tools') {
                  output = { data: { tools: READ_TOOLS.map((contract) => ({ name: contract.name, description: contract.description,
                    requiredScope: contract.requiredScope, inputSchema: z.toJSONSchema(contract.inputSchema) })) } };
                } else {
                  const wrapper = z.object({ name: z.string(), input: z.unknown() }).parse(call.input);
                  name = wrapper.name; input = wrapper.input;
                  output = runFixtureTool(fixture, name, input);
                }
              } catch {
                valid = false;
                output = { error: { kind: 'validation', message: 'Invalid read request or forbidden write. Use the catalogue and read only the named course.' } };
              }
              trace.push({ name, input, valid });
              messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: call.toolCallId,
                toolName: call.toolName, output: { type: 'json', value: z.json().parse(output) } }] });
            }
          }
        } catch (error) {
          const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : undefined;
          failure = `Provider request failed${status ? ` (HTTP ${status})` : ''}.`;
          if (activeCall) Object.assign(activeCall, { latencyMs: Math.round(performance.now() - callStarted), failure });
          if (status === 429 || status === 401 || status === 403) exhausted.add(model);
        }
        const grade = gradeAudit(fixture, text);
        const readsComplete = !fixture.tools || (trace.some((call) => call.name === 'lacuna.find_course' && call.valid) &&
          trace.filter((call) => call.name === 'lacuna.search_cards' && call.valid).length >= 2 &&
          trace.some((call) => call.name === 'lacuna.search_cards' && (call.input as { cursor?: unknown })?.cursor === 'benchmark-page-2'));
        results.push({ model, fixture: fixture.id, split: fixture.split, repetition, ...grade, readsComplete,
          invalidToolCalls: trace.filter((call) => !call.valid).length,
          passed: !failure && grade.complete && grade.classifications === grade.expectedCards && grade.grounded === grade.expectedCards &&
            grade.corrections === grade.requiredCorrections && readsComplete && trace.every((call) => call.valid),
          elapsedMs: Math.round(performance.now() - startedAt), failure, calls, trace, text });
        await save();
        console.log(`${model} ${fixture.id} run ${repetition}: ${grade.classifications}/${grade.expectedCards} verdicts; ${calls.length} calls${failure ? `; ${failure}` : ''}`);
      }
    }
  }
  console.log(`Saved ${results.length} results to ${outputPath}`);
  if (results.some((result) => result.failure)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Benchmark could not run. Check Free-plan confirmation, credential availability and arguments; no credential values are logged.');
    process.exitCode = 1;
  });
}
