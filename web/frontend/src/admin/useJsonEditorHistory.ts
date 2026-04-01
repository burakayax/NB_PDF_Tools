import { useCallback, useState } from "react";

const DEFAULT_MAX = 50;

type HistoryState = {
  value: string;
  past: string[];
  future: string[];
};

export function useJsonEditorHistory(initial: string, maxDepth = DEFAULT_MAX) {
  const [state, setState] = useState<HistoryState>({
    value: initial,
    past: [],
    future: [],
  });

  const reset = useCallback((value: string) => {
    setState({ value, past: [], future: [] });
  }, []);

  const setValue = useCallback(
    (next: string) => {
      setState((h) => ({
        past: [...h.past, h.value].slice(-maxDepth),
        future: [],
        value: next,
      }));
    },
    [maxDepth],
  );

  const undo = useCallback(() => {
    setState((h) => {
      if (h.past.length === 0) {
        return h;
      }
      const prev = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        future: [h.value, ...h.future].slice(0, maxDepth),
        value: prev,
      };
    });
  }, [maxDepth]);

  const redo = useCallback(() => {
    setState((h) => {
      if (h.future.length === 0) {
        return h;
      }
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.value].slice(-maxDepth),
        future: rest,
        value: next,
      };
    });
  }, [maxDepth]);

  return {
    value: state.value,
    setValue,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
