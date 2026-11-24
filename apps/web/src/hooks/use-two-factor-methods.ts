"use client";

import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import type { TwoFactorMethodList } from "@/auth/two-factor/methods";
import { getQueryClient } from "@/lib/query-client";

const TWO_FACTOR_METHODS_KEY = ["auth", "two-factor-methods"] as const;

export function useTwoFactorMethods({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: TWO_FACTOR_METHODS_KEY,
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<TwoFactorMethodList> => {
      const { data, error } = await authClient.twoFactor.methods();
      if (error || !data) throw new Error(error?.message || "Couldn't load your sign-in methods");
      return data;
    },
  });
}

export function refreshTwoFactorMethods() {
  void getQueryClient().invalidateQueries({ queryKey: TWO_FACTOR_METHODS_KEY });
}
