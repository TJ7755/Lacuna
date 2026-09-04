export function MoneyIllustration() {
  return (
    <div className="money-illustration" aria-hidden="true">
      <svg className="closing-left" viewBox="0 0 180 145" fill="none">
        <path d="M14 40 L147 20 L161 105 L29 125 Z M21 32 L139 13" />
        <path
          d="M35 50 Q44 50 44 40 L125 28 Q125 40 139 39 L148 86 Q136 87 138 98 L50 111 Q49 100 38 103 Z"
          opacity=".5"
        />
        <path
          className="closing-amber"
          d="M99 50 C89 39 74 47 78 62 L82 83 Q79 91 70 92 L103 87 M69 72 L95 68"
        />
        <path d="M10 15 L6 6 M159 16 L169 8 M168 122 L176 126" opacity=".6" />
      </svg>
      <svg className="closing-right" viewBox="0 0 180 145" fill="none">
        <ellipse cx="105" cy="95" rx="48" ry="12" />
        <path d="M57 95 L57 109 C64 126 147 126 153 109 L153 95 M57 108 C72 123 139 123 153 108 M64 113 L64 118 M79 118 L79 123 M133 117 L133 122" />
        <g transform="rotate(-18 65 59)">
          <ellipse cx="65" cy="59" rx="35" ry="40" />
          <ellipse cx="65" cy="59" rx="27" ry="32" opacity=".5" />
          <path
            className="closing-amber"
            d="M77 43 C68 34 56 41 59 54 L62 69 Q60 77 53 78 L79 78 M52 60 L73 60"
          />
        </g>
        <path className="closing-amber" d="M116 33 L122 23 M132 44 L143 39 M26 105 L16 110" />
      </svg>
    </div>
  );
}
