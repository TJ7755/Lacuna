/**
 * PROTOTYPE — throwaway. Fake data, no mutations. Delete after review.
 *
 * Question: how should the Share page organise five sharing mechanisms
 * (course file, share link, share code, QR code, plain text) plus import,
 * without overwhelming a teacher? Three variants, switchable via
 * `?variant=a|b|c`. Assumes the labels left in the orphaned switcher:
 * A export-first, B method tabs, C one open step at a time.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/cn';
import {
  CheckIcon,
  DownloadIcon,
  ShareIcon,
  QrCodeIcon,
  FileTextIcon,
} from '../components/ui/icons';
import { NotFound } from './NotFound';
import { ProtoBar, FakeCourses, FakeMediaNotice, FakeLinkCard } from './sharePrototypeBits';
import { useProtoVariant } from './sharePrototypeVariant';

const FAKE_LINK = 'https://lacuna-beta-one.vercel.app/#/s/8421704ec372887eb695cc1ad195cffd';
const FAKE_CODE = 'lacuna1qyqszqgpqyqszqgpqyqszqgpexample';
const FAKE_TEXT = 'Q: What carries oxygenated blood away from the heart?\nA: The aorta.';

function FakeCopy({ label = 'Copy' }: { label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <CheckIcon width={14} height={14} />
          Copied
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 pb-28 md:px-10">
      <header className="mb-8">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-ink-faint">
          Prototype · fake data
        </p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">{intro}</p>
      </header>
      {children}
    </div>
  );
}

/** A — the course file is the primary path; everything else hides behind one disclosure. */
function VariantA() {
  const [course, setCourse] = useState('Biology');
  const [othersOpen, setOthersOpen] = useState(false);
  return (
    <Shell
      title="Share"
      intro="Save a course file to share lessons, cards and media. Your study history stays private."
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">1</span>
        <h2 className="font-display text-xl">Choose a course</h2>
      </div>
      <button type="button" onClick={() => setCourse(course === 'Biology' ? 'Welcome to Lacuna' : 'Biology')} className="block w-full text-left">
        <FakeCourses selected={course} />
      </button>

      <div className="mb-3 mt-8 flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">2</span>
        <h2 className="font-display text-xl">Save the file</h2>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">{course}.lacourse · 2.4 MB</p>
            <p className="text-xs text-ink-faint">Includes media. Students import it from the Import screen.</p>
          </div>
          <Button variant="primary">
            <DownloadIcon width={18} height={18} />
            Save course file
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setOthersOpen((v) => !v)}
          aria-expanded={othersOpen}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <span className="text-sm font-medium text-ink">Other ways to share</span>
          <span aria-hidden className="text-ink-faint">{othersOpen ? '▾' : '▸'}</span>
        </button>
        {othersOpen && (
          <div className="flex flex-col gap-3 border-t border-line px-6 py-4">
            <p className="text-xs text-ink-faint">
              Links, codes and QR pictures omit media files. Use them for text-only courses.
            </p>
            <FakeLinkCard />
            <FakeMediaNotice />
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Receiving a course? <Link to="/import" className="text-accent underline underline-offset-2">Go to Import</Link>.
      </p>
    </Shell>
  );
}

type Method = 'link' | 'file' | 'code' | 'qr' | 'text';
const METHODS: Array<{ id: Method; label: string }> = [
  { id: 'link', label: 'Link' },
  { id: 'file', label: 'File' },
  { id: 'code', label: 'Code' },
  { id: 'qr', label: 'QR' },
  { id: 'text', label: 'Text' },
];

/** B — method-first tabs; the course picker sits inside each method panel. */
function VariantB() {
  const [method, setMethod] = useState<Method>('link');
  const [course, setCourse] = useState('Biology');
  return (
    <Shell title="Share" intro="Pick how to send it, then pick the course. Each method carries something different.">
      <div role="tablist" aria-label="Share methods" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
        {METHODS.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={method === m.id}
            onClick={() => setMethod(m.id)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium',
              method === m.id ? 'bg-accent text-accent-fg' : 'text-ink-soft hover:bg-ink/5',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-display text-xl">
          {method === 'link' && 'Share link'}
          {method === 'file' && 'Course file'}
          {method === 'code' && 'Share code'}
          {method === 'qr' && 'QR code'}
          {method === 'text' && 'Plain text'}
        </h2>
        <button type="button" onClick={() => setCourse(course === 'Biology' ? 'Welcome to Lacuna' : 'Biology')} className="mb-5 block w-full text-left">
          <FakeCourses selected={course} />
        </button>

        {method === 'link' && (
          <div className="flex flex-col gap-3">
            <FakeLinkCard />
            <div className="mx-auto rounded-xl border border-line bg-white p-4 dark:bg-white">
              <QRCode value={FAKE_LINK} size={160} level="L" bgColor="#ffffff" fgColor="#000000" />
            </div>
            <p className="text-xs text-ink-faint">Includes media and updates in place when you republish.</p>
          </div>
        )}
        {method === 'file' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised p-4">
            <p className="text-sm text-ink-soft">{course}.lacourse · 2.4 MB · includes media</p>
            <Button variant="primary">
              <DownloadIcon width={18} height={18} />
              Save course file
            </Button>
          </div>
        )}
        {method === 'code' && (
          <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">Your share code</span>
              <FakeCopy />
            </div>
            <p className="break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft">{FAKE_CODE}</p>
            <div className="mt-3"><FakeMediaNotice /></div>
          </div>
        )}
        {method === 'qr' && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border border-line bg-white p-4 dark:bg-white">
              <QRCode value={FAKE_CODE} size={192} level="L" bgColor="#ffffff" fgColor="#000000" />
            </div>
            <p className="text-xs text-ink-faint">Text-only courses fit in one code. Media needs the file.</p>
          </div>
        )}
        {method === 'text' && (
          <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">Plain text export</span>
              <FakeCopy />
            </div>
            <p className="whitespace-pre-line rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft">{FAKE_TEXT}</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** C — one open step at a time: course, then method, then send. */
function VariantC() {
  const [course, setCourse] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const open: 1 | 2 | 3 = course === null ? 1 : method === null ? 2 : 3;
  const methodMeta: Record<Method, { icon: ReactNode; hint: string }> = {
    link: { icon: <ShareIcon width={18} height={18} />, hint: 'Best for classes · includes media · updates in place' },
    file: { icon: <DownloadIcon width={18} height={18} />, hint: 'A file to send anywhere · includes media' },
    code: { icon: <ShareIcon width={18} height={18} />, hint: 'Paste into messages · text only' },
    qr: { icon: <QrCodeIcon width={18} height={18} />, hint: 'Project in the classroom · text only' },
    text: { icon: <FileTextIcon width={18} height={18} />, hint: 'Copy into worksheets · text only' },
  };
  return (
    <Shell title="Share" intro="Three short steps. Nothing else on screen until you need it.">
      <ol className="flex flex-col gap-4">
        <li className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">
              <span className="mr-2 text-ink-faint">1.</span>Course{course && <span className="text-ink-faint"> — {course}</span>}
            </h2>
            {open !== 1 && <Button size="sm" variant="ghost" onClick={() => setCourse(null)}>Change</Button>}
          </div>
          {open === 1 && (
            <button type="button" onClick={() => setCourse(course === 'Biology' ? 'Welcome to Lacuna' : 'Biology')} className="mt-4 block w-full text-left">
              <FakeCourses selected={course ?? ''} />
            </button>
          )}
        </li>

        <li className={cn('rounded-2xl border p-6', course === null ? 'border-line bg-surface opacity-50' : 'border-line bg-surface')}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">
              <span className="mr-2 text-ink-faint">2.</span>Method{method && <span className="text-ink-faint"> — {METHODS.find((m) => m.id === method)?.label}</span>}
            </h2>
            {open === 3 && <Button size="sm" variant="ghost" onClick={() => setMethod(null)}>Change</Button>}
          </div>
          {open === 2 && (
            <div className="mt-4 flex flex-col gap-2">
              {(Object.keys(methodMeta) as Method[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMethod(id)}
                  className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-line-strong"
                >
                  <span className="text-accent">{methodMeta[id].icon}</span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{METHODS.find((m) => m.id === id)?.label}</span>
                    <span className="block text-xs text-ink-faint">{methodMeta[id].hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </li>

        <li className={cn('rounded-2xl border p-6', open !== 3 ? 'border-line bg-surface opacity-50' : 'border-line-strong bg-surface')}>
          <h2 className="font-display text-xl">
            <span className="mr-2 text-ink-faint">3.</span>Send
          </h2>
          {open === 3 && method && (
            <div className="mt-4">
              {method === 'link' && <FakeLinkCard />}
              {method === 'file' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised p-4">
                  <p className="text-sm text-ink-soft">{course}.lacourse · 2.4 MB</p>
                  <Button variant="primary">
                    <DownloadIcon width={18} height={18} />
                    Save course file
                  </Button>
                </div>
              )}
              {method === 'code' && (
                <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">Your share code</span>
                    <FakeCopy />
                  </div>
                  <p className="break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft">{FAKE_CODE}</p>
                </div>
              )}
              {method === 'qr' && (
                <div className="mx-auto w-fit rounded-xl border border-line bg-white p-4 dark:bg-white">
                  <QRCode value={FAKE_CODE} size={192} level="L" bgColor="#ffffff" fgColor="#000000" />
                </div>
              )}
              {method === 'text' && (
                <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">Plain text export</span>
                    <FakeCopy />
                  </div>
                  <p className="whitespace-pre-line rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft">{FAKE_TEXT}</p>
                </div>
              )}
            </div>
          )}
        </li>
      </ol>
    </Shell>
  );
}

export function SharePrototypePage() {
  // Throwaway route: never render for real users, even if the route leaks into a build.
  if (!import.meta.env.DEV) return <NotFound />;
  return <SharePrototypeInner />;
}

function SharePrototypeInner() {
  const variant = useProtoVariant();
  return (
    <>
      {variant === 'a' && <VariantA />}
      {variant === 'b' && <VariantB />}
      {variant === 'c' && <VariantC />}
      <ProtoBar variant={variant} />
    </>
  );
}
