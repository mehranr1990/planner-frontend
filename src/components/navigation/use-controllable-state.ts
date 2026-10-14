"use client";

import { useCallback, useState } from "react";

interface ControllableStateOptions<T> {
  value: T | undefined;
  defaultValue: T;
  onChange?: (next: T) => void;
}

/** Controlled when `value` is defined, otherwise keeps its own state; always reports changes. */
export function useControllableState<T>({ value, defaultValue, onChange }: ControllableStateOptions<T>) {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;

  const setValue = useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [current, setValue] as const;
}
