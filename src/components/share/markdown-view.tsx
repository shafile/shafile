"use client";

import dynamic from "next/dynamic";
import { MarkdownRenderer } from "./markdown-renderer";

const MarkdownViewHighlight = dynamic(
  () =>
    import("./markdown-view-highlight").then(
      (module) => module.MarkdownViewHighlight,
    ),
  {
    loading: () => (
      <div
        className="h-24 animate-pulse rounded-xl bg-surface-2"
        aria-hidden="true"
      />
    ),
  },
);

const CODE_FENCE = /(^|\n)[ \t]*(```|~~~)/;

export function MarkdownView({ source }: { source: string }) {
  if (CODE_FENCE.test(source)) {
    return <MarkdownViewHighlight source={source} />;
  }
  return <MarkdownRenderer source={source} />;
}
