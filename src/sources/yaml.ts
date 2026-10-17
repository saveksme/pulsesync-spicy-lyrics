// A small YAML reader for LRCLIB "lyricsfile" documents: block mappings and
// sequences, quoted and plain scalars, numbers, booleans, `[]`/`{}`, and
// `|`/`>` block scalars. Not a general YAML parser.

interface YamlLine {
  indent: number;
  text: string;
}

function tokenize(source: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    let indent = raw.length - raw.trimStart().length;
    let text = raw.trim();
    // "- key: value" becomes a dash marker plus "key: value" two columns deeper.
    while (text === "-" || text.startsWith("- ")) {
      lines.push({ indent, text: "-" });
      if (text === "-") {
        text = "";
        break;
      }
      const rest = text.slice(2);
      indent += 2 + (rest.length - rest.trimStart().length);
      text = rest.trimStart();
    }
    if (text) lines.push({ indent, text });
  }
  return lines;
}

function unquoteDouble(body: string): string {
  try {
    return JSON.parse(`"${body}"`) as string;
  } catch {
    return body.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

export function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value.startsWith("'")) {
    const end = value.lastIndexOf("'");
    return value.slice(1, end > 0 ? end : undefined).replace(/''/g, "'");
  }
  if (value.startsWith('"')) {
    const end = value.lastIndexOf('"');
    return unquoteDouble(value.slice(1, end > 0 ? end : undefined));
  }
  const plain = value.replace(/\s+#.*$/, "");
  if (plain === "[]") return [];
  if (plain === "{}") return {};
  if (plain === "null" || plain === "~" || plain === "") return null;
  if (plain === "true") return true;
  if (plain === "false") return false;
  if (/^[-+]?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  return plain;
}

const KEY_VALUE = /^([^:#][^:]*?):(?:\s+(.*))?$/;

class Reader {
  private index = 0;

  constructor(private readonly lines: YamlLine[]) {}

  parse(): unknown {
    if (this.lines.length === 0) return null;
    return this.node(this.lines[0].indent);
  }

  private node(indent: number): unknown {
    const line = this.lines[this.index];
    if (!line) return null;
    if (line.text === "-") return this.sequence(indent);
    if (KEY_VALUE.test(line.text)) return this.mapping(indent);
    this.index++;
    return parseScalar(line.text);
  }

  private sequence(indent: number): unknown[] {
    const items: unknown[] = [];
    while (this.lines[this.index]?.indent === indent && this.lines[this.index].text === "-") {
      this.index++;
      const next = this.lines[this.index];
      items.push(next && next.indent > indent ? this.node(next.indent) : null);
    }
    return items;
  }

  private mapping(indent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    while (this.lines[this.index]?.indent === indent && this.lines[this.index].text !== "-") {
      const match = KEY_VALUE.exec(this.lines[this.index].text);
      if (!match) break;
      this.index++;
      const key = match[1].trim();
      const rest = match[2]?.trim();
      if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
        result[key] = this.blockScalar(indent, rest.startsWith(">"));
      } else if (rest !== undefined && rest !== "") {
        result[key] = parseScalar(rest);
      } else {
        const next = this.lines[this.index];
        const nested = next && (next.indent > indent || (next.indent === indent && next.text === "-"));
        result[key] = nested ? this.node(next.indent) : null;
      }
    }
    return result;
  }

  private blockScalar(indent: number, folded: boolean): string {
    const parts: string[] = [];
    while (this.lines[this.index] && this.lines[this.index].indent > indent) {
      parts.push(this.lines[this.index].text);
      this.index++;
    }
    return parts.join(folded ? " " : "\n");
  }
}

export function parseYaml(source: string): unknown {
  return new Reader(tokenize(source)).parse();
}
