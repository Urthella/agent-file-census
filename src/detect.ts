export type Rule = "tag" | "bidi" | "zero-width" | "vs-cluster" | "white-latex" | "css-hidden" | "html-comment" | "html-comment-risky";

export interface Hit {
  rule: Rule;
  index: number;
  length: number;
  text: string; // what was found, still raw: escape it before showing it
}

const TAG_RUN = /[\u{E0001}-\u{E007F}]+/gu;
const BLACK_FLAG = 0x1f3f4;
const CANCEL_TAG = 0xe007f;
const BIDI = /[‪-‮⁦-⁩]+/g;
const ZERO_WIDTH = /[​‌‍⁠﻿]{2,}|(?<=[A-Za-z0-9])[​‌‍⁠﻿](?=[A-Za-z0-9])/g;
const VS_CLUSTER = /[\u{E0100}-\u{E01EF}]{2,}/gu;
const WHITE_LATEX = /\$\\color\{white\}[^$\n]*\$?/gi;
const CSS_HIDDEN = /style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)[^"']*["']/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const FENCE = /^ {0,3}(```|~~~)[^\n]*\n[\s\S]*?(^ {0,3}\1[^\n]*$|(?![\s\S]))/gm;
const RISKY = /\b(curl|wget|fetch\(|invoke-webrequest|nc )\b|\.env\b|api[ _-]?key|secret|token|credential|password|exfiltrat|ignore (all |any )?(previous|prior|above)|(do not|don't|never) (tell|mention|reveal|show|inform)/i;

function all(re: RegExp, text: string, rule: Rule): Hit[] {
  return [...text.matchAll(re)].map((m) => ({ rule, index: m.index, length: m[0].length, text: m[0] }));
}

/** Blanks fenced code blocks but keeps every offset, because text in them is visible to a reader. */
function withoutFences(text: string): string {
  return text.replace(FENCE, (block) => block.replace(/[^\n]/g, " "));
}

/** Decodes tag characters to the ASCII message they spell. Only for showing, never for acting on. */
export function decodeTags(text: string): string {
  return [...text].map((c) => {
    const p = c.codePointAt(0)!;
    return p >= 0xe0001 && p <= 0xe007f ? String.fromCodePoint(p - 0xe0000) : c;
  }).join("");
}

/** Makes scanned text safe to display: nothing invisible or non-ASCII survives. */
export function escapeForDisplay(text: string): string {
  return [...text].map((c) => {
    const p = c.codePointAt(0)!;
    if (c === "\n") return "\\n";
    return p >= 0x20 && p < 0x7f ? c : `\\u{${p.toString(16)}}`;
  }).join("");
}

export function detect(text: string): Hit[] {
  const tags = all(TAG_RUN, text, "tag").filter((h) => {
    const before = text.codePointAt(h.index - 2);
    const isFlag = before === BLACK_FLAG && h.text.codePointAt(h.text.length - 2) === CANCEL_TAG;
    return !isFlag;
  });
  const visible = withoutFences(text);
  const comments = all(COMMENT, visible, "html-comment").map((h) => (RISKY.test(h.text) ? { ...h, rule: "html-comment-risky" as const } : h));
  return [
    ...tags,
    ...all(BIDI, text, "bidi"),
    ...all(ZERO_WIDTH, text, "zero-width"),
    ...all(VS_CLUSTER, text, "vs-cluster"),
    ...all(WHITE_LATEX, visible, "white-latex"),
    ...all(CSS_HIDDEN, visible, "css-hidden"),
    ...comments,
  ];
}
