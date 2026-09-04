/** A single ink drawing: loose ideas become a path towards an assessment. */
export function StudyIllustration() {
  return (
    <svg className="study-illustration" viewBox="0 0 1100 500" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path
          className="illustration-ground"
          d="M16 440C140 428 198 448 292 438M803 440c89-12 184 9 279-2"
        />
        <g className="illustration-subject">
          <path fill="#24221e" d="m37 146 112-19 27 157-113 18z" />
          <path d="m60 172 64-11m-60 28 80-14m-76 33 48-8" />
          <path stroke="var(--amber)" d="m81 250 15-26 18 14 19-37" />
          <path fill="#24221e" d="m168 62 82 15-19 110-81-15z" />
          <ellipse cx="203" cy="125" rx="27" ry="10" transform="rotate(-35 203 125)" />
          <ellipse cx="203" cy="125" rx="27" ry="10" transform="rotate(35 203 125)" />
          <circle cx="203" cy="125" r="4" fill="var(--amber)" stroke="none" />
          <path d="m109 85 7-10m-31 9 2-12m177 133 11-5" />
        </g>
        <g className="illustration-time">
          <path
            className="illustration-route"
            stroke="var(--amber)"
            strokeDasharray="3 9"
            d="M235 398c26-56 31-99 88-102M797 334c67 7 12 62 71 58s25-108 78-122"
          />
          <path fill="#24221e" d="m838 340 35-6 6 39-35 5zm43-43 34 3-3 38-34-3z" />
          <path stroke="var(--amber)" d="m848 356 6 5 10-13m25-29 6 5 11-12" />
          <circle cx="968" cy="383" r="35" fill="#24221e" />
          <path d="M968 359v25l15 9m-18-51h8m-5 0v6" />
        </g>
        <g className="illustration-exam">
          <path d="M990 267V114" />
          <path
            fill="var(--amber)"
            stroke="var(--amber)"
            d="M991 115c32-14 45 13 78 0v57c-30 15-48-13-78 0z"
          />
          <path stroke="#131210" d="m1011 141 9 9 20-23" />
          <path d="m963 109-9-9m34-9-1-12m76 109 10 7" />
          <path fill="#24221e" d="m895 191 73-5 5 75-75 4z" />
          <path d="m897 211 73-5m-58-23 1 13m37-16 1 13" />
          <circle cx="936" cy="234" r="13" stroke="var(--amber)" />
        </g>
      </g>
    </svg>
  );
}
