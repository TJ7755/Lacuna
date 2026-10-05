import { MarkdownEditor } from '../markdown/MarkdownEditor';

export function QuestionSetPromptEditor({
  value,
  onChange,
  shared,
}: {
  value: string;
  onChange: (value: string) => void;
  shared: boolean;
}) {
  return (
    <MarkdownEditor
      ariaLabel="Question text"
      label={shared ? 'Question introduction' : 'Question text'}
      value={value}
      onChange={onChange}
      minRows={6}
      allowImages={false}
      layout="tabs"
      compactToolbar
    />
  );
}
