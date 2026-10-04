import type { MotionSpeed } from '../../state/motionSpeed';
import { SegmentedPills } from './SettingsUi';

const OPTIONS: { value: MotionSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

interface MotionSpeedControlProps {
  value: MotionSpeed;
  onChange: (value: MotionSpeed) => void;
}

/** Animation speed as a three-way pill: slow, normal or fast. */
export function MotionSpeedControl({ value, onChange }: MotionSpeedControlProps) {
  return (
    <SegmentedPills label="Animation speed" value={value} options={OPTIONS} onChange={onChange} />
  );
}
