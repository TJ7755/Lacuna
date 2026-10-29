export function QualificationGuidance() {
  return (
    <details className="rounded-2xl border border-line px-4 py-2 text-sm leading-relaxed text-ink-soft">
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
        Not sure which qualification to choose?
      </summary>
      <div className="max-w-prose space-y-3 pb-3">
        <p>
          Combined Science includes biology, chemistry and physics. Biology is the separate
          qualification.
        </p>
        <p>
          GCSE and IGCSE are different qualifications. Match your school’s exam board and syllabus
          code.
        </p>
        <p>
          Check the exam timetable or specification, or ask the school or teacher before choosing.
        </p>
      </div>
    </details>
  );
}
