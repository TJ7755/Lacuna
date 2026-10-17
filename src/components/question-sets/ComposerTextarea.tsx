import { useLayoutEffect, useRef, type ComponentProps } from 'react';

export function ComposerTextarea(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const grow = () => {
      const scrollParent = field.closest('main');
      const scrollTop = scrollParent?.scrollTop;
      field.style.height = '0px';
      field.style.height = `${Math.max(44, field.scrollHeight)}px`;
      if (scrollParent && scrollTop !== undefined) scrollParent.scrollTop = scrollTop;
    };
    grow();
    let width = field.getBoundingClientRect().width;
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      const next = field.getBoundingClientRect().width;
      if (next !== width) {
        width = next;
        // Changing the observed height during delivery creates another resize notification.
        if (frame === undefined)
          frame = requestAnimationFrame(() => {
            frame = undefined;
            grow();
          });
      }
    });
    observer.observe(field);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={1} />;
}
