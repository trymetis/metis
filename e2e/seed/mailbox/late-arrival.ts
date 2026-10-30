import { PEOPLE, SUBJECTS } from "../../lib/cast";
import { mail, type SeededMail } from "./build";

export function lateArrival(): SeededMail {
  return mail({
    key: "late-arrival",
    from: PEOPLE.mira,
    to: [PEOPLE.ana],
    subject: SUBJECTS.lateArrival,
    date: "2026-09-27T09:00",
    seen: false,
    text: `Hi Ana,

Harbour Hall is held for the Aozora launch on November 26 until Friday.
Please sign the terms I sent last week and reply by Friday noon, or the
hold lapses.

Thanks,
Mira`,
  });
}
