import type { ReactNode } from 'react';
import { cn } from '../../components/ui/cn';
import {
  SettingsSectionHeading,
  SettingsSubsectionHeading,
} from '../settings/SettingsSectionHeading';
import { SETTINGS_HEADING_ROW_CLASS, SettingsCard } from '../settings/SettingsUi';

// Help reuses the Settings surfaces: cards, heading rows and the heading-level context, so
// a topic's headings sit one level below whichever row or card contains it.

/** A Settings card with an optional icon heading; its id is the topic's deep-link anchor. */
export function HelpCard({
  id,
  icon,
  title,
  className,
  children,
}: {
  id?: string;
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SettingsCard id={id} className={cn('scroll-mt-20', className)}>
      {title && (
        <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
          {icon}
          <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
            {title}
          </SettingsSectionHeading>
        </div>
      )}
      {children}
    </SettingsCard>
  );
}

/** The introductory sentence at the top of a topic. */
export function HelpIntro({ children }: { children: ReactNode }) {
  return <p className="mb-5 text-ink-soft">{children}</p>;
}

/** One titled entry within a topic, separated from its neighbours by a hairline. */
export function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-5 first:pt-0 last:border-b-0 last:pb-0">
      <SettingsSubsectionHeading className="mb-2 font-medium text-ink">
        {title}
      </SettingsSubsectionHeading>
      <div className="space-y-2 text-sm text-ink-soft [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

export function ModeCard({
  title,
  description,
  whatItDoes,
  whenToUse,
  tip,
}: {
  title: string;
  description: string;
  whatItDoes: string;
  whenToUse: string;
  tip?: string;
}) {
  return (
    <div className="border-b border-line py-5 first:pt-0 last:border-b-0 last:pb-0">
      <SettingsSubsectionHeading className="mb-1.5 font-medium text-ink">
        {title}
      </SettingsSubsectionHeading>
      <p className="mb-3 text-sm text-ink-soft">{description}</p>
      <div className="space-y-2 text-sm text-ink-soft">
        <p>
          <strong className="text-ink">What it does:</strong> {whatItDoes}
        </p>
        <p>
          <strong className="text-ink">When to use:</strong> {whenToUse}
        </p>
        {tip && (
          <p className="rounded-lg bg-accent-soft/40 px-3 py-2.5 text-xs text-accent-ink">
            <strong className="text-accent-ink">Tip:</strong> {tip}
          </p>
        )}
      </div>
    </div>
  );
}

/** A key cap, styled like the in-session shortcuts sheet. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-sans text-xs text-ink-soft">
      {children}
    </kbd>
  );
}
