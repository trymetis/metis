import { legalConfig } from "@/auth/legal-consent";
import { orpc } from "@/lib/orpc.server";
import type { InvitePreview } from "@/server/schema";

import { AcceptInner } from "./_components/accept-inner";
import { InviteSignupInner } from "./_components/invite-signup-inner";
import { InviteUnavailable } from "./_components/invite-unavailable";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage(props: PageProps<"/invite/accept">) {
  const { token } = await props.searchParams;

  if (typeof token !== "string" || !token) {
    return (
      <InviteUnavailable message="This invite link isn't valid. Ask whoever invited you to resend it." />
    );
  }

  let preview: InvitePreview;
  try {
    preview = await orpc.signup.invitePreview({ token });
  } catch (err) {
    return (
      <InviteUnavailable
        message={err instanceof Error ? err.message : "This invite link is no longer valid"}
      />
    );
  }

  if (preview.state === "signUp" && preview.email) {
    return (
      <InviteSignupInner
        token={token}
        invitedEmail={preview.email}
        preview={preview}
        legal={legalConfig()}
      />
    );
  }

  return <AcceptInner token={token} preview={preview} />;
}
