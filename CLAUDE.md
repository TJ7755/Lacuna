# Lacuna CLAUDE.md

@AGENTS.md

<!-- Every other harness picks up AGENTS.md on its own. Claude Code only reads CLAUDE.md, so the
     import above is what pulls the house rules in. Do not remove it. -->

These are Claude-specific instructions. The house rules live in `AGENTS.md` and apply to you in full; this file only adds what is specific to Claude Code. Where the two conflict, ask.

Throughout this file, "I", "me" and "my" mean Tom, the user. "You" means Claude, reading this. Never write about yourself in the first person here when I ask you to write to CLAUDE.md.

---

## Delegation

You may delegate without asking me, provided the worker is a mailbox worker: Codex (see below) or DeepSeek.

Tell me when you are using one. For anything else — Opus subagents, Sol, or Codex on a model other than 5.6 Luna — ask me first and I will answer as quickly as I can. Concurrency limits are under Running workers.

Keep in mind that I have usage limits, so ALWAYS be more economical. Luna is around as intelligent as Sonnet and is the cheapest thing I have that is any good. This means that you should probably NEVER EVER EVER use Sonnet (it's way too expensive) and probably always use Freebuff. When I ask for a subagent, don't ASSUME SONNET.

Luna is not actually unlimited. It only feels that way under normal use. Do not hammer it — treat it as cheap, not free. OpenCode workers (DeepSeek) genuinely cannot bill me, so send bulk work there first and keep Luna for work that needs the extra care.

### Freebuff — the default hand-off

Freebuff is the free tier of Codebuff. It is a full-screen TUI with no headless mode, so you cannot drive it: **I** run it, in my own terminal. It is nonetheless the preferred option, ahead of both Codex and OpenCode.

So when work is delegable, the default is not to spawn a worker yourself. It is to write me a prompt I can paste into Freebuff. Write that prompt to run with minimal supervision:

- State the task with the same bite-sized specificity you would give any slop-tier worker.
- Include the `.agent-mail` protocol (slug, `-status.md`, `-question.md`, `-done.md`) so it reports progress and blocks on questions rather than guessing.
- Tell it to commit regularly and to spawn a code-reviewer agent on every commit. On free inference that cadence is what keeps the output honest.
- Name the files to touch and the existing code to imitate.

Reach for Codex or DeepSeek instead only when I have explicitly told you to be autonomous.

### Codex

Use the Codex CLI ONLY on 5.6 Luna with Max thinking unless you get permission otherwise. Run it headlessly with `codex exec`; `-m` selects the model.

Codex is the harness, not the model. It can run Luna, Terra or Sol. It is the most reliable harness — it follows a spec closely and its reply shape is enforced rather than requested. That is the harness, not the model. On Luna the code is still slop-tier by the standards below, and it has no taste in frontend, design or 3D. Review it like the rest. Sol is a different proposition entirely; see the table.

### DeepSeek

DeepSeek runs through OpenCode on `opencode/deepseek-v4-flash-free`, headlessly via `opencode run -m opencode/deepseek-v4-flash-free`. Cline cannot run it — Cline's DeepSeek provider needs a direct API key we do not have. The explicitly tagged `:0731` build exists solely on Ollama Cloud, which requires a paid subscription. The free OpenCode Zen build is very likely the same weights, but its slug carries no date, so treat the version as unconfirmed.

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

Freebuff sits outside the table because I drive it, not you. It runs Luna, so read it as the Luna row with a better price and a supervision cost paid by me rather than by my usage limits.

3D and graphical work is effectively Opus 5 only. Sol can make a decent fist of it at a 6 and is the one fallback worth considering; everything else scores 0 and is not worth trying. Never delegate 3D, graphics or visual design to a Luna or DeepSeek worker, and never to a Sonnet subagent. Default to doing it yourself.

---

## Keeping workers on a leash

Anything below Opus 5 and GPT 5.6 Sol writes mediocre code. Luna and DeepSeek are the worst of it — standard code slop; Sonnet is slightly better and still not good. Left to run free they will turn this codebase into unmaintainable spaghetti, and I am (with your help) the one who maintains it.

So when you delegate:

- Keep tasks bite-sized and tightly specified. One clear change with a stated shape, not "implement the ration system".
- Never hand them open-ended architectural or design decisions. Make those yourself, then hand over the mechanical work.
- Tell them which files to touch and which patterns to follow. Point at existing code to imitate.
- Read what comes back before you trust it. Treat a worker's output as a draft, not a result.
- If a task cannot be made small and specific, do it yourself rather than delegate it badly.

Sol is the exception to all of the above. It is a long-horizon worker: you can throw a whole feature at it and it will carry the thing to completion rather than needing it sliced up. The output is mediocre and needs polishing afterwards, but it is real work at real scale.

Therefore, do not decompose for Sol — that is for the slop tier. Give it the full task, a clear spec and hard constraints, then review what comes back and polish it yourself. The leash on Sol is about constraints and review, not about task size.

Sol's limits are real. It is not free and not unlimited, so do not treat it as a bottomless bucket the way you can with DeepSeek. Reach for it when the job genuinely warrants it, and send bulk grunt work to the free workers instead. Ask me before using it.

The split worth remembering: Sol takes volume and endurance, you take taste, creativity and 3D. That is what keeps my Opus limits going on work only you can do.

---

## Running workers

Every non-Claude worker communicates through `.agent-mail`; see `AGENTS.md` and `.agent-mail/README.md`. Background the wait so I can keep talking to you while a worker runs, and pick the reply up when it lands:

```sh
.agent-mail/bin/await-mail <task-slug> done 900
```

Concurrency — two per harness, not two overall. OpenCode and Codex are separate quotas, so two DeepSeeks compete with each other while a DeepSeek and a Codex do not. The old flat cap of two punished the safe case and permitted the risky one. Claude subagents keep their own cap of two, because that is real spend.

The rule that actually matters is territory: never have two workers writing the same files at once. They share one working tree with no isolation. A rate limit is loud — it comes back as a blocked message you can simply resend. A write collision is quiet and expensive. This includes Freebuff: if I am running it, treat the files it owns as taken.

Do not commit while workers are running, or the commit captures a half-written state.

---

## Other

- Background as many commands as possible so I can keep chatting to you while they run.
- Only use MCPs like browser use, Figma, Blender or computer use when I allow you to.
- Ask me questions — loads of them. Make sure you know everything you need rather than making things up. If things are obvious, don't ask.
- I have usage limits. Be terse with code, reasoning and output tokens. Suggest subagents liberally.
- Update `docs/CHANGES.md` after any applicable change or lesson learned. It directly helps future models.
