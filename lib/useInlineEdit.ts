import { useCallback, useRef, useState } from 'react';

// useInlineEdit — small state machine for click-to-edit fields.
// `commit` runs the save; on failure the previous value is restored and the
// onError callback fires (parent decides whether to show a toast).
//
// Optimistic by design: the new value is shown immediately while the save is
// in flight. If the save throws or returns false, we revert.

type Status = 'view' | 'edit' | 'saving';

type Options<T> = {
  initial: T;
  commit: (next: T) => Promise<void> | void;
  onError?: (err: unknown) => void;
};

export function useInlineEdit<T>({ initial, commit, onError }: Options<T>) {
  const [value, setValue] = useState<T>(initial);
  const [status, setStatus] = useState<Status>('view');
  const previousRef = useRef<T>(initial);

  const start = useCallback(() => {
    previousRef.current = value;
    setStatus('edit');
  }, [value]);

  const cancel = useCallback(() => {
    setValue(previousRef.current);
    setStatus('view');
  }, []);

  const save = useCallback(async (next: T) => {
    if (next === value && status !== 'edit') {
      setStatus('view');
      return;
    }
    setValue(next);
    setStatus('saving');
    try {
      await commit(next);
      setStatus('view');
    } catch (err) {
      setValue(previousRef.current);
      setStatus('view');
      onError?.(err);
    }
  }, [commit, onError, status, value]);

  const set = useCallback((next: T) => setValue(next), []);

  return { value, status, start, cancel, save, set };
}
