"use client";

import { useEffect, useRef, useTransition } from "react";

/**
 * React 19 resets a <form action={…}> after every submission, which wipes the
 * user's input when validation fails. This submits through onSubmit instead,
 * and only resets the form after a successful save (when `resetWhen` changes
 * to a truthy value).
 */
export function useFormSubmit(dispatch: (fd: FormData) => void, resetWhen?: unknown) {
  const ref = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (resetWhen) ref.current?.reset();
  }, [resetWhen]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { ref, onSubmit };
}
