# CI baseline for area classification

Measured before the #726 workflow change from one complete successful pull-request CI run:
[run 39937567561](https://github.com/TJ7755/Lacuna/actions/runs/39937567561),
head `d8624b732a424010b1255fbc38c682d338130197`, 23 October 2026, 10:13:31–10:20:23 UTC.
Workflow elapsed time: 412 seconds, including scheduling. Job durations are completed minus
started timestamps from `gh run view 39937567561 --json jobs,createdAt,updatedAt,headSha,event,url`.
These are observed wall times, not a predicted saving or a validation budget.

```text
Job                                             Seconds
changes                                          5
documentation                                    12
lint                                             85
test-coverage                                    65
python-tools (short-term-memory)                 20
browser-standalone (gaps)                        117
electron-ai                                      134
relay                                            29
test-unit (1)                                    168
ai-mcp                                           23
windows-installed-upgrade                        203
test-unit (3)                                    93
typecheck                                        19
python-tools (semantic-answer-match)             132
browser-standalone (reporting)                   91
test-unit (6)                                    91
test-unit (2)                                    160
browser-standalone (library)                     90
production                                       38
handwriting                                      20
test-unit (4)                                    94
test-unit (5)                                    100
electron-macos-smoke                             106
browser-tests (3)                                168
browser-mobile                                   92
browser-tests (8)                                247
browser-timing (chromium-study-performance)      142
browser-tests (6)                                192
browser-tests (2)                                142
browser-tests (7)                                240
browser-tests (1)                                242
browser-timing (chromium-image-performance)      226
browser-tests (5)                                191
browser-tests (4)                                106
browser-timing (chromium-sidebar-motion)         83
test                                             2
browser-smoke                                    2
```
