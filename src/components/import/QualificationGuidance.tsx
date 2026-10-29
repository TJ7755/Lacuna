export function QualificationGuidance() {
  return (
    <details className="rounded-2xl border border-line px-4 py-2 text-sm leading-relaxed text-ink-soft">
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
        Not sure which qualification to choose?
      </summary>
      <div className="flex max-w-prose flex-col gap-3 pb-3">
        <p>
          Combined Science includes biology, chemistry and physics in one qualification. Biology is
          the separate qualification.
        </p>
        <p>
          GCSE and IGCSE are different qualifications. Match the qualification, exam board (awarding
          body) and syllabus code to the school’s course.
        </p>
        <p>
          Find the board and syllabus code on the exam timetable or specification. If you are unsure
          which route, board or code applies, ask the school or teacher before choosing.
        </p>
      </div>
    </details>
  );
}
