import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';

type SettingsHeadingLevel = 2 | 3;

const SettingsHeadingLevelContext = createContext<SettingsHeadingLevel>(2);

export function SettingsHeadingLevelProvider({
  level,
  children,
}: {
  level: SettingsHeadingLevel;
  children: ReactNode;
}) {
  return (
    <SettingsHeadingLevelContext.Provider value={level}>
      {children}
    </SettingsHeadingLevelContext.Provider>
  );
}

export function SettingsSectionHeading({
  level,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: SettingsHeadingLevel }) {
  const inheritedLevel = useContext(SettingsHeadingLevelContext);
  const Heading = (level ?? inheritedLevel) === 3 ? 'h3' : 'h2';
  return <Heading {...props} />;
}

export function SettingsSubsectionHeading(props: HTMLAttributes<HTMLHeadingElement>) {
  const sectionLevel = useContext(SettingsHeadingLevelContext);
  const Heading = sectionLevel === 3 ? 'h4' : 'h3';
  return <Heading {...props} />;
}
