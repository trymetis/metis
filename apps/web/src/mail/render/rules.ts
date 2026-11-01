import { compileTrackers, type TrackerRules } from "./detect";
import { compileLinkRules, type LinkRules } from "./links";
import type { ClearUrlsProvider, TrackerVendor } from "./types";

export interface PrivacyRules {
  trackers: TrackerRules;
  links: LinkRules;
}

export function compilePrivacyRules(
  vendors: readonly TrackerVendor[],
  providers: readonly ClearUrlsProvider[],
): PrivacyRules {
  return { trackers: compileTrackers(vendors), links: compileLinkRules(providers) };
}
