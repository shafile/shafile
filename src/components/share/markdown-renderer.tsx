"use client";

import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { openExternalLink } from "@/lib/client/telegram";

const BLOCKED_TAGS = new Set([
  "img",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "style",
  "script",
  "link",
  "meta",
]);

const schema = {
  ...defaultSchema,
  tagNames: defaultSchema.tagNames?.filter((tag) => !BLOCKED_TAGS.has(tag)),
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

export function MarkdownRenderer({
  source,
  extraRehypePlugins,
}: {
  source: string;
  extraRehypePlugins?: NonNullable<Options["rehypePlugins"]>;
}) {
  return (
    <div className="markdown-body" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, schema],
          ...(extraRehypePlugins ?? []),
        ]}
        skipHtml
        components={{
          a: ({ href, title, children }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(event) => {
                if (!href || event.defaultPrevented) return;
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                if (openExternalLink(href)) event.preventDefault();
              }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
