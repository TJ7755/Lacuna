# Forward simulation

[forwardSim](../../src/fsrs/forwardSim.ts) is the pure exam-date projection layer;
[its tests](../../src/fsrs/forwardSim.test.ts) own formula examples and edge cases.
It must remain independent of React and IndexedDB.

The projection asks how recall changes at a fixed deadline with or without a review now.
It uses an assumed review outcome, not knowledge of the learner's future answer. Fractional
elapsed time at an exact exam instant is deliberate and need not match an integer-day training
representation. Preserve the distinction when changing scheduling time calculations.

The course forecast is a different question: predicted recall at its horizon assuming no future
reviews. A historical line must use evidence available at that historical point, finish at the
current figure, and not imply that future reviews or real examination outcomes are guaranteed.
[courseForecast](../../src/fsrs/courseForecast.ts) owns that calculation; chart layout belongs in
its components and tests rather than a second diagram here.

[Specification index](../SPEC.md)
