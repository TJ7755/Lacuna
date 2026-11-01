import { KeyboardIcon } from '../../components/ui/icons';
import { useInputMode, type InputMode } from '../../state/inputMode';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { SegmentedPills, SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';

const INPUT_OPTIONS: { value: InputMode; label: string }[] = [
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'touch', label: 'Touch' },
  { value: 'auto', label: 'Auto' },
];

export function InputModeSection() {
  const [inputMode, setInputMode] = useInputMode();

  return (
    <SettingsCard id="settings-input">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className={SETTINGS_HEADING_ROW_CLASS}>
          <KeyboardIcon width={18} height={18} />
          <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
            Input mode
          </SettingsSectionHeading>
        </div>
        <SegmentedPills
          label="Input mode"
          value={inputMode}
          options={INPUT_OPTIONS}
          onChange={setInputMode}
        />
      </div>
    </SettingsCard>
  );
}
