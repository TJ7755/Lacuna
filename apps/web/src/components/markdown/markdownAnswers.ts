import {
  plainTextFromHtml,
  typedAnswerCorrect,
  type TypedAnswerFeedback,
} from './typedAnswerFeedback';
import { prepareNumericAnswer, renderMarkdownToHtml } from './markdownRenderer';

/** Whether a typed answer matches Markdown source, judged as its typed feedback marks it. */
export function markdownAnswerCorrect(source: string, feedback: TypedAnswerFeedback): boolean {
  return typedAnswerCorrect(renderMarkdownToHtml(source, false, false), feedback);
}

/** Markdown source as plain text, for sending to a marker. */
export function markdownPlainText(source: string): string {
  return plainTextFromHtml(renderMarkdownToHtml(source, false, false));
}

/** Inspect embed-aware output so media URLs are not offered as typing targets. */
export function markdownAnswerShape(source: string): { text: string; hasVisual: boolean } {
  const html = renderMarkdownToHtml(prepareNumericAnswer(source), true, false);
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return {
    text: plainTextFromHtml(body, true),
    hasVisual:
      body.querySelector(
        'img, table, audio, video, iframe, object, embed, canvas, pre.lacuna-mermaid',
      ) !== null || Array.from(body.querySelectorAll('svg')).some((svg) => !svg.closest('.katex')),
  };
}
