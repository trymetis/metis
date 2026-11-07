import { carddavVerify } from "@/contacts/providers/carddav";

import { createCredentialDriver } from "./credential";

export const carddavDriver = createCredentialDriver({
  provider: "carddav",
  label: "CardDAV",
  async verify(credentials) {
    await carddavVerify(credentials);
  },
});
