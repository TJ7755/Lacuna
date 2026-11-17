import type { Card } from '@lacuna/core/db/types';
import { canIntroduceCard, introductionStage, type LessonIntroduction } from './lessonIntroduction';
import { snapshotSession, type SessionState } from './sessionMachine';

/** Owns presentation identity, recognition guards and the snapshot used by Undo or edits. */
export class SessionIntroduction {
  private presentationState: {
    serial: number;
    stage: ReturnType<typeof introductionStage>;
  } = { serial: 0, stage: undefined };
  private checked = false;
  private recognition: { machine: SessionState; card: Card } | null = null;

  get presentation() {
    return this.presentationState;
  }

  present(introduction: LessonIntroduction | undefined, card: Card) {
    const stage = introductionStage(introduction, card.id);
    this.presentationState = {
      serial: this.presentationState.serial + 1,
      stage: stage && canIntroduceCard(card) ? stage : undefined,
    };
    this.checked = false;
  }

  check(serial: number, card: Card, machine: SessionState): boolean {
    if (
      this.presentationState.stage !== 'familiarise' ||
      this.checked ||
      this.presentationState.serial !== serial
    )
      return false;
    this.checked = true;
    this.recognition = { machine: snapshotSession(machine), card };
    return true;
  }

  canContinue(serial: number): boolean {
    return this.presentationState.serial === serial && this.checked;
  }

  get hasUndo() {
    return this.recognition !== null;
  }

  takeUndo() {
    const recognition = this.recognition;
    this.clearUndo();
    return recognition;
  }

  clearUndo() {
    this.recognition = null;
  }

  /** Restore before reconciling an edited pair, so Undo cannot resurrect its removed partner. */
  restoreBeforeEdit(card: Card): SessionState | undefined {
    if (
      this.presentationState.stage !== 'familiarise' ||
      !this.checked ||
      this.recognition?.card.id !== card.id
    )
      return;
    return this.takeUndo()!.machine;
  }
}
