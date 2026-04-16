const ROOT_ASSIGNMENT_RE = /^\s*root\s*=\s*[A-Z][A-Za-z0-9_]*\s*\(/m;
const COMPONENT_CALL_RE = /\b[A-Z][A-Za-z0-9_]*\s*\(/;
const MARKDOWN_HEADING_RE = /^\s{0,3}#/m;

export function splitOpenUiContentAndContext(content: string | undefined): {
  content: string | null;
  contextString: string | null;
} {
  if (!content) {
    return { content: null, contextString: null };
  }

  const match = content.match(/<context>([\s\S]*?)<\/context>/);
  if (!match) {
    const trimmed = content.trim();
    return { content: trimmed || null, contextString: null };
  }

  const renderedContent = content.replace(match[0], "").trim();
  return {
    content: renderedContent || null,
    contextString: match[1]?.trim() || null,
  };
}

export function looksLikeOpenUiProgram(content: string | undefined): boolean {
  if (!content) {
    return false;
  }

  const { content: stripped } = splitOpenUiContentAndContext(content);
  if (!stripped) {
    return false;
  }

  if (MARKDOWN_HEADING_RE.test(stripped)) {
    return false;
  }

  return ROOT_ASSIGNMENT_RE.test(stripped) && COMPONENT_CALL_RE.test(stripped);
}

export function extractOpenUiPayload(content: string | undefined): {
  code: string;
  contextString: string | null;
} | null {
  const parts = splitOpenUiContentAndContext(content);
  if (!parts.content || !looksLikeOpenUiProgram(parts.content)) {
    return null;
  }

  return {
    code: parts.content,
    contextString: parts.contextString,
  };
}
