import { renderToReadableStream } from 'react-dom/server';
import { QuizletComparison } from './QuizletComparison';

export async function render() {
  // Keep the outer renderer separate from the card renderer’s nested static Markdown pass.
  const stream = await renderToReadableStream(<QuizletComparison />);
  return new Response(stream).text();
}
