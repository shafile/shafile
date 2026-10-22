import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const locales = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "ru",
  "ar",
  "fr",
  "de",
  "hi",
  "es-MX",
];
const base = resolve(process.cwd(), "messages");

function flatten(value, prefix = "", output = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, output);
    } else {
      output.set(path, String(child));
    }
  }
  return output;
}

function placeholders(message) {
  const names = new Set();
  for (const match of message.matchAll(/\{\s*([a-zA-Z][\w]*)\s*[,}]/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

const dictionaries = new Map();
for (const locale of locales) {
  dictionaries.set(
    locale,
    flatten(JSON.parse(readFileSync(resolve(base, `${locale}.json`), "utf8"))),
  );
}

const reference = dictionaries.get("en");
const problems = [];

for (const locale of locales.slice(1)) {
  const messages = dictionaries.get(locale);
  for (const key of reference.keys()) {
    if (!messages.has(key)) {
      problems.push(`${locale}: missing key "${key}"`);
    }
  }
  for (const key of messages.keys()) {
    if (!reference.has(key)) {
      problems.push(`${locale}: extra key "${key}"`);
    }
  }
}

for (const locale of locales) {
  const messages = dictionaries.get(locale);
  for (const [key, message] of messages) {
    const expected = placeholders(reference.get(key) ?? "");
    const actual = placeholders(message);
    if (expected.join(",") !== actual.join(",")) {
      problems.push(
        `${locale}: placeholders differ for "${key}" (expected ${expected.join(", ") || "none"}, got ${actual.join(", ") || "none"})`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`i18n check passed: ${reference.size} keys across ${locales.length} locales.`);
