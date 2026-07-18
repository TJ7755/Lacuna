import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';
import { SigmoidExplorer } from '../components/method/SigmoidExplorer';
import { WeightsChart } from '../components/method/WeightsChart';
import { LossExplorer } from '../components/method/LossExplorer';
import { OverallResults, LagResults } from '../components/method/ResultsCharts';
import { BlendCurve } from '../components/method/BlendCurve';
import { LandingCta } from '../components/welcome/LandingCta';

/**
 * The technical account behind the landing page's short-term memory model
 * claims. Linked from the Welcome course path; same editorial world as the
 * landing page (full-screen, outside the app shell), but structured as a
 * walkthrough of the argument: the model, the scoring rule, the fitting, the
 * test discipline, the results, and the handover to FSRS-6. Every chart is
 * interactive and every number comes from the shipped coefficients or the
 * hold-out benchmark — nothing illustrative or rounded for effect.
 */

function Part({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <section ref={ref} className="border-t border-line py-16 first:border-t-0">
      <div className={'reveal ' + (visible ? 'reveal-visible' : '')}>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Part {n}</p>
        <h2 className="mt-2 text-3xl text-balance sm:text-4xl">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

function Formula({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="mt-5 overflow-x-auto rounded-[10px] border border-line bg-surface-raised px-5 py-4 font-mono text-sm text-ink shadow-paper"
    >
      {children}
    </div>
  );
}

export function Method() {
  // A fresh page in the same document — start at the top, not wherever the
  // landing page's scroll position happened to be.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="bg-dot-grid border-b border-line">
        <div className="mx-auto max-w-3xl px-6 pb-16 pt-14 sm:px-10">
          <Link
            to="/welcome"
            className="hero-rise inline-flex min-h-10 items-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-accent"
          >
            ← Back to the course
          </Link>
          <p
            className="hero-rise mt-10 font-mono text-[11px] uppercase tracking-[0.18em] text-accent"
            style={{ animationDelay: '80ms' }}
          >
            The technical account · short-term memory model
          </p>
          <h1
            className="hero-rise mt-5 text-4xl leading-[1.08] text-balance sm:text-6xl"
            style={{ animationDelay: '160ms' }}
          >
            How we checked it, with the working shown.
          </h1>
          <p
            className="hero-rise mt-7 max-w-xl text-lg leading-relaxed text-ink-soft"
            style={{ animationDelay: '280ms' }}
          >
            The landing page claims the new model is six to twelve times more accurate at short
            lags. This page is the receipt: the actual model, the actual fitted numbers, how the
            fit was done and how the test was kept honest. GCSE maths is plenty — every chart
            below can be dragged, and none of the numbers are rounded for effect.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 sm:px-10">
        <Part n="01" title="First, a naming correction">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            The model is called <span className="font-mono text-[0.92em]">half-life-logistic</span>,
            and the name oversells the first half. It does not compute a half-life and feed it into
            a decay curve — no half-life is calculated anywhere in the code. What actually runs is
            a standard <span className="font-medium text-ink">logistic regression</span>: elapsed
            time is simply one of ten input numbers. The name records the family of ideas it was
            benchmarked against, not its mechanics — worth knowing before you describe it to
            anyone technical.
          </p>
        </Part>

        <Part n="02" title="The whole model is one line">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            Ten numbers describing the situation — how long since the last review, whether it went
            well, the card&rsquo;s track record — are each multiplied by a fitted weight and added
            up into a single score, <span className="font-mono text-[0.92em]">z</span>. A sigmoid
            then bends that score into a valid probability:
          </p>
          <Formula label="z equals the weighted sum of ten features; probability of recall equals one over one plus e to the minus z">
            z = w₀ + w₁x₁ + w₂x₂ + … + w₉x₉
            <br />
            P(recall) = 1 / (1 + e<sup>−z</sup>)
          </Formula>
          <p className="mt-5 max-w-2xl leading-relaxed text-ink-soft">
            Whatever <span className="font-mono text-[0.92em]">z</span> comes out to — hugely
            negative, zero, hugely positive — the result always lands between 0 and 1. Drag the
            marker and watch the flat tails: once the evidence pushes strongly one way, the model
            becomes very confident and stops changing its mind. The steep middle is where the
            day-to-day uncertainty lives.
          </p>
          <SigmoidExplorer />

          <h3 className="mt-12 font-body text-lg font-semibold tracking-normal text-ink">
            The ten weights, exactly as shipped
          </h3>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-soft">
            These are the fitted coefficients from the model running in the app, not a sketch.
            Bars to the right push predicted recall up; bars to the left push it down. Select any
            row for the plain-language reading.
          </p>
          <WeightsChart />
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-faint">
            Notice that succeeded and failed are exact mirror images. That is not a coincidence:
            the two features are perfect complements, so on their own they would have infinitely
            many equally valid weight pairs. The small ridge penalty described in Part 04 is what
            forces the fit onto the symmetric, smallest-magnitude pair.
          </p>
        </Part>

        <Part n="03" title="The scoring rule that decided the contest">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            Models were judged mainly on <span className="font-medium text-ink">log loss</span>:
            for each real review, the model states a probability, the learner either remembers or
            forgets, and the model pays a price that depends on how confident it was.
          </p>
          <Formula label="loss equals minus the sum of y times the log of p and one minus y times the log of one minus p">
            loss = −[ y·ln(p) + (1−y)·ln(1−p) ]
          </Formula>
          <p className="mt-5 max-w-2xl leading-relaxed text-ink-soft">
            The logarithm makes this brutal on confident wrong answers: predicting 99.9% and being
            wrong costs about as much as hundreds of cautious coin-flip guesses. Drag the
            prediction below and compare what it pays when the learner remembered against when
            they forgot — both curves run off to infinity at the edges.
          </p>
          <LossExplorer />
          <p className="mt-5 max-w-2xl leading-relaxed text-ink-soft">
            That asymmetry is exactly why the old system scored so badly. FSRS-6 thinks in whole
            days, so anything under a day is floored to &ldquo;no time has passed&rdquo; — it was
            forced to predict near-certain recall five minutes after a review, then punished
            heavily every time a learner had already forgotten. Two gentler companions were also
            tracked: the <span className="font-medium text-ink">Brier score</span> (plain squared
            error, <span className="font-mono text-[0.92em]">(p − y)²</span>) and{' '}
            <span className="font-medium text-ink">calibration error</span>, which buckets
            predictions into ten confidence bands and asks whether &ldquo;80% confident&rdquo;
            really came true 80% of the time.
          </p>
        </Part>

        <Part n="04" title="How the ten weights were found">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            Not neural-network training — no learning rate, no thousands of small steps. This is
            classical penalised maximum-likelihood logistic regression, solved with{' '}
            <span className="font-medium text-ink">Newton&rsquo;s method</span>: at each of up to
            twelve iterations the fitting code computes the slope of the loss surface and how it
            curves (a 10×10 matrix of second derivatives), then solves one small system of linear
            equations to jump straight to where the local approximation bottoms out. With only ten
            parameters and a loss surface this well behaved, it converges in a handful of jumps —
            the full fit took roughly fourteen seconds, not hours.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
            A small ridge penalty (λ&nbsp;=&nbsp;0.001) leans on every weight except the intercept,
            stopping any coefficient growing large just to chase a rare quirk in the data — and
            producing the mirrored success/failure pair above. One efficiency trick is worth
            knowing: the code never re-scans the 2.58 million training rows per iteration. It
            groups examples with identical feature combinations and keeps just two numbers per
            group — how many times, how many succeeded. A logistic regression&rsquo;s likelihood
            depends only on those counts, so this is a lossless shortcut, not an approximation.
          </p>
        </Part>

        <Part n="05" title="Keeping the test honest">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            Three candidates entered: the method Lacuna already used (FSRS-6), this lightweight
            statistical model, and a more elaborate memory-science model (ACT-R multi-trace). The
            pass mark was set before any results were seen: a challenger only won by beating the
            baseline across the board, with no significant blind spot at any timescale from under
            a minute to a week. And the harness enforces strict chronological replay per learner —
            it throws an error if an event arrives out of order or twice, so a model can only be
            trained on earlier reviews and scored on strictly later ones it has never seen. No
            shuffling, no peeking at the future, no grading its own homework.
          </p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { num: '3,504,441', label: 'real historical reviews from an anonymised public research dataset' },
              { num: '876,163', label: 'held-out reviews the models were scored on, none seen in training' },
              { num: '602,534', label: 'of those fall inside the seven-day window that matters for cramming' },
            ].map((s) => (
              <div key={s.num} className="rounded-[10px] border border-line bg-surface-raised p-4">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="font-mono text-xl text-accent">{s.num}</span>
                  <span className="mt-1.5 block text-sm leading-snug text-ink-soft">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-faint">
            The honest caveat, repeated here on purpose: the data covers 100 real students from a
            public research dataset, and none of it is Lacuna&rsquo;s own usage. A solid,
            honestly-tested starting point — not a claim of perfection for every learner on day
            one. The model keeps adjusting to each learner on their own device, and their study
            history never leaves it.
          </p>
          <p className="mt-5 max-w-2xl leading-relaxed text-ink-soft">
            That caveat is why the model was not left at one test. It has since been run cold,
            unchanged, against two further, completely independent cohorts of real students —
            hundreds of thousands more held-out reviews it had never seen in any form. It kept its
            edge for 90 of every 100 users in both, not just the cohort it was built on.
          </p>
        </Part>

        <Part n="06" title="The results">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            The simplest candidate won. Flick between the three metrics — the ranking never
            changes, and on calibration the gap is an order of magnitude.
          </p>
          <OverallResults />
          <p className="mt-10 max-w-2xl leading-relaxed text-ink-soft">
            And this is the &ldquo;how much better at short lags, specifically&rdquo; picture. The
            old baseline is wildly overconfident under an hour; by a week out the two models
            agree, because that is the range FSRS-6 was designed for in the first place — which is
            exactly why it keeps that territory.
          </p>
          <LagResults />
        </Part>

        <Part n="07" title="The handover">
          <p className="max-w-2xl leading-relaxed text-ink-soft">
            The handover depends on what just happened, not a fixed number of days. Testing the
            model cold on those two further cohorts showed its extra edge over several days only
            held up after a wrong answer, not after a right one — so the handover follows suit.
            Get a card right and the short-term model steps back within a day, since a fresh
            success is exactly the evidence FSRS-6 already handles well. Get one wrong and the
            short-term model keeps the lead for four days before handing over. Either way the two
            probabilities are smoothly blended rather than swapped outright, so the same review
            evidence is never counted twice — a handover, not a cliff edge.
          </p>
          <BlendCurve />
        </Part>

        <section className="border-t border-line py-16">
          <div className="rounded-[10px] border border-accent/40 bg-gradient-to-br from-surface-raised to-accent-soft/50 p-8 shadow-paper sm:p-10">
            <h2 className="text-3xl text-balance sm:text-4xl">That is the whole argument.</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
              A ten-weight model, one unforgiving scoring rule, a pre-registered pass mark and a
              strictly chronological test. If it holds up for you the way it held up on 3.5
              million reviews, the best way to find out is to study with it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LandingCta>Open the dashboard</LandingCta>
              <Link
                to="/welcome"
                className="inline-flex min-h-12 items-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-accent"
              >
                Back to the course
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-line py-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            Sources: the shipped model coefficients and the hold-out benchmark in{' '}
            <span className="normal-case">tooling/short-term-memory/BENCHMARK.md</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
