import { useCallback, useRef, useState } from 'react';

// useOptimistic — apply a UI update immediately, run the mutation, and
// rollback on failure. Pattern:
//
//   const [value, runMutation] = useOptimistic(initial);
//   runMutation({
//     optimistic: { ...value, sent: true },
//     mutation: () => fetch('/api/.../send'),
//     onError: () => toast.error('Could not send.'),
//   });
//
// The current optimistic value is exposed as `value`. While a mutation is
// in flight, `inFlight` is true. If `mutation()` throws or returns a
// non-OK Response, the state is rolled back to the value at the moment
// runMutation was called.

type Mutation<T> = {
  optimistic: T;
  mutation: () => Promise<Response | unknown>;
  onError?: (e: unknown) => void;
  onSuccess?: (result: unknown) => void;
};

export function useOptimistic<T>(
  initial: T,
): [T, (m: Mutation<T>) => Promise<boolean>, { inFlight: boolean; reset: (t: T) => void }] {
  const [value, setValue] = useState<T>(initial);
  const [inFlight, setInFlight] = useState(false);
  const previousRef = useRef<T>(initial);

  const run = useCallback(async (m: Mutation<T>): Promise<boolean> => {
    previousRef.current = value;
    setValue(m.optimistic);
    setInFlight(true);
    try {
      const result = await m.mutation();
      if (result instanceof Response && !result.ok) {
        throw new Error(`Request failed: ${result.status}`);
      }
      m.onSuccess?.(result);
      return true;
    } catch (err) {
      setValue(previousRef.current);
      m.onError?.(err);
      return false;
    } finally {
      setInFlight(false);
    }
  // We intentionally read latest value via state; the closure capture is
  // fine because setValue above always uses the current value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const reset = useCallback((t: T) => setValue(t), []);

  return [value, run, { inFlight, reset }];
}
