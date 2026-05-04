"use client";

import { useEffect } from "react";

const HIDE_DELAY_MS = 900;

/** capture 단계에서 스크롤 타깃에 잠깐 `ds-scrollbar-active`를 붙여, 스크롤바 썸을 표시한다. */
export default function ScrollbarActivityRoot() {
  useEffect(() => {
    const timeouts = new WeakMap<Element, ReturnType<typeof setTimeout>>();

    const onScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const prev = timeouts.get(target);
      if (prev !== undefined) clearTimeout(prev);

      target.classList.add("ds-scrollbar-active");

      const t = setTimeout(() => {
        target.classList.remove("ds-scrollbar-active");
        timeouts.delete(target);
      }, HIDE_DELAY_MS);
      timeouts.set(target, t);
    };

    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  return null;
}
