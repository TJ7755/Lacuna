import { JEV_PROVIDER } from '@lacuna/core/jev/types';

export function JevConsentNotice({
  checked,
  onChange,
  warningId,
  detailsId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  warningId?: string;
  detailsId?: string;
}) {
  return (
    <div className="space-y-3">
      <p
        id={warningId}
        className="rounded-xl border border-negative/40 bg-negative/5 px-4 py-3 text-sm leading-6 text-ink"
      >
        AI marking sends study text to {JEV_PROVIDER.name} in the {JEV_PROVIDER.region}. Do not
        include personal data about yourself or anyone else.
      </p>
      <ul id={detailsId} className="list-disc space-y-1 pl-5 text-sm leading-5 text-ink-soft">
        <li>
          The service also chooses multiple-choice options from lesson material and classifies
          techniques you write.
        </li>
        <li>
          Lacuna has zero data retention enabled with {JEV_PROVIDER.name}, which says it does not
          train its model on submissions.
        </li>
        <li>
          AI marking is experimental. You can correct its marks or mark answers yourself. Turning it
          off stops new requests.
        </li>
        <li>
          <a
            href={JEV_PROVIDER.privacyPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent-ink underline underline-offset-2"
          >
            {JEV_PROVIDER.name} privacy policy
          </a>
        </li>
      </ul>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-ink/[0.03] p-3 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent-ink"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        I’ve read this and will keep personal data out of study material I use with AI marking.
      </label>
    </div>
  );
}
