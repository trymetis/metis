import "server-only";
import { isUtf8 } from "node:buffer";

import iconv from "iconv-lite";

const UTF8_LABELS = new Set(["utf8", "unicode11utf8", "unicode20utf8"]);

const SINGLE_BYTE_LABEL =
  /^(?:usascii|ascii|iso8859\d{1,2}[ie]?|latin\d{1,2}|l\d{1,2}|(?:windows|cp)125\d|koi8[a-z]{0,2}|(?:cp|ibm)(?:437|737|775|85[0-8]|86\d)|(?:windows|cp|ibm)874|mac(?:intosh|roman)?)$/;

const utf8 = new TextDecoder("utf-8");
const windows1252 = new TextDecoder("windows-1252");

function utf8OrWindows1252(bytes: Buffer): string {
  return isUtf8(bytes) ? utf8.decode(bytes) : windows1252.decode(bytes);
}

function decodeByLabel(bytes: Buffer, label: string): string | null {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {}
  return iconv.encodingExists(label) ? iconv.decode(bytes, label) : null;
}

export function decodeBody(bytes: Buffer, charset: string | undefined): string {
  const label = (charset ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  if (!label) return utf8OrWindows1252(bytes);
  const key = label.replace(/^x-/, "").replace(/[\s._-]+/g, "");
  if (UTF8_LABELS.has(key)) return utf8.decode(bytes);
  if (SINGLE_BYTE_LABEL.test(key) && isUtf8(bytes)) return utf8.decode(bytes);
  return decodeByLabel(bytes, label) ?? utf8OrWindows1252(bytes);
}
