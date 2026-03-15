import { type FsrsState } from '../../db/repositories/fsrs';
import { previewNextReview, type ReviewRating } from '../../lib/fsrs';
import { formatRelativeDuration } from '../../lib/formatDuration';
import { UI } from '../../ui-strings';
import styles from './RatingButtons.module.css';

interface RatingButtonsProps {
  state: FsrsState;
  onRate: (rating: ReviewRating) => void;
}

const RATINGS: ReadonlyArray<ReviewRating> = ['again', 'hard', 'good', 'easy'];
const KEY_MAP: Record<ReviewRating, string> = {
  again: '1',
  hard: '2',
  good: '3',
  easy: '4',
};
const LABEL_MAP: Record<ReviewRating, (preview: string) => string> = {
  again: UI.review.ratingAgain,
  hard: UI.review.ratingHard,
  good: UI.review.ratingGood,
  easy: UI.review.ratingEasy,
};

export function RatingButtons({ state, onRate }: RatingButtonsProps) {
  return (
    <div className={styles.buttons}>
      {RATINGS.map((rating) => {
        const nextDate = previewNextReview(state, rating);
        const preview = formatRelativeDuration(nextDate);
        return (
          <button
            key={rating}
            type="button"
            className={styles.button}
            onClick={() => onRate(rating)}
          >
            <span className={styles.label}>{LABEL_MAP[rating](preview)}</span>
            <span className={styles.key}>
              {UI.review.keyboardHint(KEY_MAP[rating])}
            </span>
          </button>
        );
      })}
    </div>
  );
}
