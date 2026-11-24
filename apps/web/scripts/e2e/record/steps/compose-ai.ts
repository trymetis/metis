import { COMPOSE_AI } from "@metis/e2e/lib/llm-scenarios";

import { draftApology, draftStanceReply, rewriteText } from "../../../../src/mail/compose-ai";
import { Failures, findEmail, loadWorld, type StepContext } from "./context";

export async function run(ctx: StepContext): Promise<void> {
  const { mail } = ctx.session;
  const world = await loadWorld(ctx);
  const email = findEmail(world, COMPOSE_AI.subject);
  const failures = new Failures();

  for (const stance of COMPOSE_AI.stances) {
    await failures.attempt(`stance ${stance}`, async () => {
      await draftStanceReply(mail, { messageId: email.id, stance });
      console.log(`[record] stance ${stance} for "${email.subject}"`);
    });
  }
  await failures.attempt("stance with a draft", async () => {
    await draftStanceReply(mail, {
      messageId: email.id,
      stance: COMPOSE_AI.draft.stance,
      draft: COMPOSE_AI.draft.text,
    });
    console.log(`[record] stance ${COMPOSE_AI.draft.stance} with a draft for "${email.subject}"`);
  });
  await failures.attempt("apology", async () => {
    await draftApology(mail, { messageId: email.id, ...COMPOSE_AI.apology });
    console.log(`[record] apology for "${email.subject}"`);
  });
  for (const mode of COMPOSE_AI.rewrite.modes) {
    await failures.attempt(`rewrite ${mode}`, async () => {
      await rewriteText(mail, { text: COMPOSE_AI.rewrite.text, mode });
      console.log(`[record] rewrite ${mode}`);
    });
  }
  failures.throwIfAny();
}
