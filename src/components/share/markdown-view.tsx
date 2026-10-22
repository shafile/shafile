"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

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

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="markdown-body" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, schema],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        skipHtml
        components={{
          a: ({ href, title, children }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
