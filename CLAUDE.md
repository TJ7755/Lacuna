# Lacuna CLAUDE.md

@AGENTS.md

<!-- Every other harness picks up AGENTS.md on its own. Claude Code only reads CLAUDE.md, so the
     import above is what pulls the house rules in. Do not remove it. -->

These are Claude-specific instructions. The house rules live in `AGENTS.md` and apply to you in full; this file only adds what is specific to Claude Code. Where the two conflict, ask.

Throughout this file, "I", "me" and "my" mean Tom, the user. "You" means Claude, reading this. Never write about yourself in the first person here when I ask you to write to CLAUDE.md.

---

## Delegation

You may delegate without asking me, provided the worker is a mailbox worker: Codex (see below), DeepSeek or Grok.

Tell me when you are using one. For anything else — Opus subagents, Sol, or Codex on a model other than 5.6 Luna — ask me first and I will answer as quickly as I can. Concurrency limits are under Running workers.

Keep in mind that I have usage limits, so ALWAYS be more economical. Luna is around as intelligent as Sonnet and is the cheapest thing I have that is any good. This means that you should probably NEVER EVER EVER use Sonnet (it's way too expensive) and probably always use Freebuff. When I ask for a subagent, don't ASSUME SONNET.

Luna is not actually unlimited. It only feels that way under normal use. Do not hammer it — treat it as cheap, not free. OpenCode workers (DeepSeek) genuinely cannot bill me, so send bulk work there first and keep Luna for work that needs the extra care. The Cline route to DeepSeek goes through my authenticated Cline account rather than the free OpenCode Zen endpoint, so do not assume it is equally free; treat it as cheap but metered, and reach for OpenCode when the work is bulk.

### Freebuff — the default hand-off

Freebuff is the free tier of Codebuff. It is a full-screen TUI with no headless mode, so you cannot drive it: **I** run it, in my own terminal. It is nonetheless the preferred option, ahead of both Codex and OpenCode.

So when work is delegable, the default is not to spawn a worker yourself. It is to write me a prompt I can paste into Freebuff. Write that prompt to run with minimal supervision:

- State the task with the same bite-sized specificity you would give any slop-tier worker.
- Include the `.agent-mail` protocol (slug, `-status.md`, `-question.md`, `-done.md`) so it reports progress and blocks on questions rather than guessing.
- Tell it to commit regularly, in small granular steps.
- Name the files to touch and the existing code to imitate.
- Give it an explicit permitted-paths list, and say which files another worker owns. A worker that finds a needed file missing from that list will stop and ask, which costs a round trip; a worker with no list at all will wander.

**Codebuff appears to have removed the reviewer-agent capability.** As of 13 August 2026 a Freebuff worker reports that it cannot spawn one and falls back to checking its own diff, which is not review. The old instruction here was to tell it to spawn a code-reviewer on every commit; that instruction now produces no review at all, silently, because the worker follows the brief, fails to spawn, and carries on regardless. **So the review is yours.** Read every commit on the branch before it merges, and verify the checks yourself rather than trusting the completion message. Re-test this if Codebuff changes; if the capability returns, restore the per-commit cadence, because on free inference that is what keeps the output honest.

Reach for Codex, DeepSeek or Grok instead only when I have explicitly told you to be autonomous.

### Codex

Use the Codex CLI ONLY on 5.6 Luna with Max thinking unless you get permission otherwise. Run it headlessly with `codex exec`; `-m` selects the model.

Codex is the harness, not the model. It can run Luna, Terra or Sol. It is the most reliable harness — it follows a spec closely and its reply shape is enforced rather than requested. That is the harness, not the model. On Luna the code is still slop-tier by the standards below, and it has no taste in frontend, design or 3D. Review it like the rest. Sol is a different proposition entirely; see the table.

### DeepSeek

DeepSeek runs headlessly through two harnesses, and they are separate quotas — see Running workers.

- **OpenCode**, on `opencode/deepseek-v4-flash-free`, via `opencode run -m opencode/deepseek-v4-flash-free`. This is the free OpenCode Zen build and genuinely cannot bill me. `opencode run` exposes no reasoning-effort flag, so this route always runs at the provider default.
- **Cline**, on `deepseek/deepseek-v4-flash`, via `cline --thinking xhigh -m deepseek/deepseek-v4-flash --auto-approve true`. It reaches DeepSeek through the authenticated `cline` provider, so it needs no separate API key. `--thinking` takes `none|low|medium|high|xhigh`; use `xhigh`. Prefer this route when the task rewards care, and OpenCode for bulk.

Older notes in this file claimed Cline could not run DeepSeek at all, on the grounds that it needed a direct API key. That was corrected on 12 August 2026 after checking `~/.cline/data/settings/providers.json`: the `cline` provider is authed and already configured for `deepseek/deepseek-v4-flash`.

The explicitly tagged `:0731` build exists solely on Ollama Cloud, which requires a paid subscription. The free OpenCode Zen build is very likely the same weights, but its slug carries no date, so treat the version as unconfirmed.

### Grok

Added 13 August 2026, on a SuperGrok subscription. The CLI is `grok` (Grok Build TUI, 1.0.3, at `~/.local/bin/grok`), signed in through grok.com OIDC with coding-data retention opted out. Models are `grok-4.6` (default, 500k context) and `grok-4.5`.

It runs headlessly, so it is a mailbox worker you can drive yourself — the same standing as Codex, and unlike Freebuff:

```sh
grok -p "<prompt>" -m grok-4.6 --effort high --permission-mode acceptEdits
```

- `--effort` takes `low|medium|high|xhigh`; 4.6 defaults to `high` and the config sets `high`.
- `--json-schema '<schema>'` constrains the reply and implies `--output-format json`. Use it whenever you need a parseable answer — like Codex, the shape is enforced rather than requested, which is the main reason to prefer this harness over the OpenCode and Cline routes for structured work.
- `--output-format` also takes `plain`, `streaming-json` and `streaming-messages-json`.
- `--tools` / `--disallowed-tools`, `--allow` / `--deny` and `--rules` scope what it may do and append to the system prompt. Give it a permitted-paths list through `--rules` the same way you would brief Freebuff.
- `-w/--worktree` is **ignored in headless mode**. If a Grok worker needs isolation, create the worktree yourself first and point it there with `--cwd`.

Intelligence is a 9, level with Opus 5 and Sol, and I suspect that is if anything too low. This is not a slop-tier worker and does not need the task decomposed the way Luna and DeepSeek do. Brief it like Sol: full task, clear spec, hard constraints.

It is better than Sol on the way back, though. Sol's output is real work that still needs polishing; **Grok's code is usually mergeable as written**. So review it, but review it the way you would review a competent colleague's branch — looking for what is wrong with it — rather than expecting to rewrite it. If you find yourself polishing Grok output as a matter of course, that is worth telling me, because it contradicts this.

The quota is generous. A first real session on 13 August 2026 registered 0% of the SuperGrok allowance, against roughly 5% had the same work gone to Claude. That is one data point rather than a measured ceiling, so the cost rating stays at 8 until I have pushed it harder — but it means you should not ration Grok the way you must ration Sol.

**Its taste is a 7.5**, above Sol and below you, so it is the first worker other than yourself worth giving design work to. Its 3D and graphical ability is still unrated — see below.

---

## Choosing a model

HIGHER is BETTER. These are vague values from personal experience. If you want to use models other than Luna or Sonnet, ask me.

| Model | Intelligence | Taste | 3D/Graphical | Cost | Speed |
|--------|-------------:|------:|-------------:|-----:|------:|
| Claude Opus 5 | 9 | 10 | 10 | 2 | 4 |
| Claude Sonnet 5 | 6 | 7 | 0 | 5 | 3 |
| Claude Haiku 4.5 *(don't use. Use DeepSeek or Luna)* | 0 | 0 | 0 | 7 | 5 |
| GPT 5.6 Luna Max | 4.5 | 2 | 0 | 9 | 8 |
| GPT 5.6 Terra Max | 7 | 5 | 0 | 4 | 7 |
| GPT 5.6 Sol Medium *(use Medium for virtually everything; never above High)* | 9 | 6 | 6 | 4 | 9 |
| DeepSeek V4 Flash *(free build via OpenCode Zen, likely the 0731 weights with enhanced coding)* | 4 | 3 | 0 | 10 | 4 |
| DeepSeek V4 Pro *(0813 weights, ~1.6T parameters; available in Freebuff)* | 5? | ? | ? | ? | ? |
| Grok 4.6 *(SuperGrok sub, via the `grok` CLI)* | 9 | 7.5 | ? | 8 | 8 |

Freebuff sits outside the table because I drive it, not you. It runs Luna, and as of 13 August 2026 it also offers DeepSeek V4 Pro. Either way, read it as that model's row with a better price and a supervision cost paid by me rather than by my usage limits.

**V4 Pro's ratings are pending, and you must not guess them.** It was released on 13 August 2026, so the row above carries only what is actually known: roughly 1.6T parameters against Flash's 280B, and an early third-party measurement showing about a one-point intelligence gain over Flash. Coding ability is unmeasured, and the other columns in this table were always anecdotal. Ask me for the real numbers rather than inferring them from the parameter count — a 5.7x size increase is not a claim about code quality, and until I have used it for a day the honest answer is that we do not know. Treat V4 Pro as slop-tier for leash purposes until I say otherwise.

One thing about Pro is already known, from its first outing on 13 August 2026: **it struggles to drive subagents.** Luna has never got that wrong. Since the Freebuff brief pattern depends on spawning a code-reviewer on every commit, and that cadence is what keeps free-tier output honest, Luna remains the default for Freebuff work. Do not write a brief that leans on subagents and hand it to Pro.

Pro is a Freebuff option. The OpenCode Zen and Cline routes below still run Flash unless I tell you they have changed.

**Grok 4.6's taste was rated on 13 August 2026 at 7.5**, on a from-scratch landing-page redesign: it was asked to replace a page it was told I disliked, and the idea it returned was genuinely creative rather than a restyling. I did not adopt the draft — I prefer the existing page — but the rating is about the thinking, not the outcome. So Grok is the first worker other than you that design work can go to.

**Its 3D and graphical column is still unrated, and you must not guess it.** Taste in a flat editorial layout is not evidence about 3D. Ask me before sending it anything in that column.

3D and graphical work is effectively Opus 5 only. Sol can make a decent fist of it at a 6 and is the one fallback worth considering; everything else scores 0 and is not worth trying. Never delegate 3D, graphics or visual design to a Luna or DeepSeek worker, and never to a Sonnet subagent. Default to doing it yourself.

---

## Keeping workers on a leash

Anything below Opus 5, GPT 5.6 Sol and Grok 4.6 writes mediocre code. Luna and DeepSeek are the worst of it — standard code slop; Sonnet is slightly better and still not good. Left to run free they will turn this codebase into unmaintainable spaghetti, and I am (with your help) the one who maintains it.

So when you delegate:

- Keep tasks bite-sized and tightly specified. One clear change with a stated shape, not "implement the ration system".
- Never hand them open-ended architectural or design decisions. Make those yourself, then hand over the mechanical work.
- Tell them which files to touch and which patterns to follow. Point at existing code to imitate.
- Read what comes back before you trust it. Treat a worker's output as a draft, not a result.
- If a task cannot be made small and specific, do it yourself rather than delegate it badly.

Sol and Grok are the exceptions to all of the above. Both are long-horizon workers: you can throw a whole feature at either and it will carry the thing to completion rather than needing it sliced up. Sol's output is mediocre and needs polishing afterwards, but it is real work at real scale. Grok's usually does not need the polish — see its section above.

Therefore, do not decompose for Sol — that is for the slop tier. Give it the full task, a clear spec and hard constraints, then review what comes back and polish it yourself. The leash on Sol is about constraints and review, not about task size.

Sol's limits are real. It is not free and not unlimited, so do not treat it as a bottomless bucket the way you can with DeepSeek. Reach for it when the job genuinely warrants it, and send bulk grunt work to the free workers instead. Ask me before using it.

The split worth remembering: Sol takes volume and endurance, you take taste, creativity and 3D. That is what keeps my Opus limits going on work only you can do.

---

## Running workers

Every non-Claude worker communicates through `.agent-mail`; see `AGENTS.md` and `.agent-mail/README.md`. Background the wait so I can keep talking to you while a worker runs, and pick the reply up when it lands:

```sh
.agent-mail/bin/await-mail <task-slug> done 900
```

Concurrency — two per harness, not two overall. OpenCode, Cline, Codex and Grok are separate quotas, so two OpenCode workers compete with each other while an OpenCode worker, a Cline worker, a Codex and a Grok do not — even when two of them are running the same DeepSeek model. The old flat cap of two punished the safe case and permitted the risky one. Claude subagents keep their own cap of two, because that is real spend.

The rule that actually matters is territory: never have two workers writing the same files at once. They share one working tree with no isolation. A rate limit is loud — it comes back as a blocked message you can simply resend. A write collision is quiet and expensive. This includes Freebuff: if I am running it, treat the files it owns as taken.

Do not commit while workers are running, or the commit captures a half-written state.

---

## Other

- Background as many commands as possible so I can keep chatting to you while they run.
- Only use MCPs like browser use, Figma, Blender or computer use when I allow you to.
- Ask me questions — loads of them. Make sure you know everything you need rather than making things up. If things are obvious, don't ask.
- I have usage limits. Be terse with code, reasoning and output tokens. Suggest subagents liberally.
- Update `docs/CHANGES.md` after any applicable change or lesson learned. It directly helps future models.
