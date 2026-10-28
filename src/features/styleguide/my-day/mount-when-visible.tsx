"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Mounts its children the first time it nears the viewport, and keeps them.
 * Each My Day state tile owns a data store and a timeline; this keeps the
 * Components page light until the section is scrolled to. Without
 * IntersectionObserver (old engines, tests) it stays on the placeholder.
 */

export function MountWhenVisible({
  children,
  placeholder,
  rootMargin = "600px",
}: {
  children: ReactNode;
  placeholder: ReactNode;
  rootMargin?: string;
}) {
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!node || visible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return <div ref={box}>{visible ? children : placeholder}</div>;
}
