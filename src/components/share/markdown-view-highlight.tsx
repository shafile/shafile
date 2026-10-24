"use client";

import rehypeHighlight from "rehype-highlight";
import { MarkdownRenderer } from "./markdown-renderer";

export function MarkdownViewHighlight({ source }: { source: string }) {
  return (
    <MarkdownRenderer
      source={source}
      extraRehypePlugins={[[rehypeHighlight, { detect: true }]]}
    />
  );
}
