"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metis/ui/components/dialog";
import { cn } from "@metis/ui/lib/utils";
import type { QueryKey } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useState } from "react";

import type { ConnectionResource, CredentialProvider, ProvidersFor } from "@/connections/types";
import { isCredentialProvider } from "@/connections/types";
import { rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";

import { AccountIdentity } from "./account-identity";
import { useConnectServers } from "./connect-servers-context";
import { CredentialConnectForm } from "./credential-connect-form";
import { resourceProviderMeta, serversForResource } from "./provider-meta";

const RESOURCE_QUERIES: Record<ConnectionResource, () => QueryKey[]> = {
  mailbox: () => [rpc.workspaceMailboxes.key(), rpc.mailboxes.key()],
  calendar: () => [rpc.workspaceCalendars.key(), rpc.calendars.key()],
  drive: () => [rpc.workspaceDrives.key(), rpc.drives.key()],
  addressbook: () => [rpc.workspaceAddressBooks.key(), rpc.addressBooks.key()],
};

export interface AttachableResource<R extends ConnectionResource> {
  id: string;
  email: string;
  server: string | null;
  provider: ProvidersFor<R>;
}

export interface ConnectResourceCopy {
  pickTitle: string;
  connectTitle: string;
  pickDescription: string;
  connectDescription: string;
  credentialsDescription: string;
  standaloneDescription: string;
  emptyAttachable: string;
  connectNew: string;
}

interface ConnectResourceDialogProps<R extends ConnectionResource> {
  children: ReactElement;
  resource: R;
  copy: ConnectResourceCopy;
  connectHref: (provider: ProvidersFor<R>) => string;
  attachable?: AttachableResource<R>[];
  policyNotice?: string | null;
  workspaceSlug?: string;
  onAttach?: (id: string) => Promise<void>;
}

function ProviderList<R extends ConnectionResource>({
  resource,
  connectHref,
  onCredential,
}: {
  resource: R;
  connectHref: (provider: ProvidersFor<R>) => string;
  onCredential: (provider: CredentialProvider, server: string) => void;
}) {
  const servers = serversForResource(useConnectServers(), resource);

  return (
    <div className="flex flex-col gap-2">
      {servers.map((server) => {
        const meta = resourceProviderMeta(resource, server.provider);
        const credential = isCredentialProvider(server.provider);
        return (
          <Button
            key={`${server.provider}:${server.name}`}
            variant="outline"
            className="h-auto justify-start gap-3 py-3"
            onClick={() => {
              if (isCredentialProvider(server.provider)) {
                onCredential(server.provider, server.name);
                return;
              }
              window.location.href = connectHref(server.provider);
            }}
          >
            <meta.Mark className="h-5 w-5 shrink-0" />
            <span className="text-[13px] font-medium">{credential ? server.name : meta.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export function ConnectResourceDialog<R extends ConnectionResource>({
  children,
  resource,
  copy,
  connectHref,
  attachable,
  policyNotice,
  workspaceSlug,
  onAttach,
}: ConnectResourceDialogProps<R>) {
  const canPick = attachable !== undefined && onAttach !== undefined;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "connect" | "credentials">(
    canPick ? "pick" : "connect",
  );
  const [credential, setCredential] = useState<{
    provider: CredentialProvider;
    server: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickEl, setPickEl] = useState<HTMLDivElement | null>(null);
  const [connectEl, setConnectEl] = useState<HTMLDivElement | null>(null);
  const [credentialsEl, setCredentialsEl] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>();

  const stepKey = open ? canPick : null;
  const [stepFor, setStepFor] = useState(stepKey);
  if (stepKey !== stepFor) {
    setStepFor(stepKey);
    if (open) setStep(canPick ? "pick" : "connect");
  }

  useEffect(() => {
    if (!open) return;
    const el = step === "pick" ? pickEl : step === "connect" ? connectEl : credentialsEl;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, open, pickEl, connectEl, credentialsEl]);

  function openCredentials(provider: CredentialProvider, server: string) {
    setCredential({ provider, server });
    setStep("credentials");
  }

  function connected() {
    setOpen(false);
    router.refresh();
    void Promise.all(
      [...RESOURCE_QUERIES[resource](), rpc.connections.key()].map((key) => refreshQueries(key)),
    );
  }

  async function attach(id: string) {
    if (!onAttach) return;
    setBusyId(id);
    try {
      await onAttach(id);
      setOpen(false);
    } finally {
      setBusyId(null);
    }
  }

  const credentialsForm = credential && (
    <CredentialConnectForm
      key={`${credential.provider}:${credential.server}`}
      provider={credential.provider}
      server={credential.server}
      attachToWorkspaceSlug={workspaceSlug}
      onConnected={connected}
    />
  );

  const providerList = (
    <ProviderList resource={resource} connectHref={connectHref} onCredential={openCredentials} />
  );

  if (!canPick) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={children} />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === "credentials" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Back"
                  onClick={() => setStep("connect")}
                  className="-ml-2 h-7 w-7"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {copy.connectTitle}
            </DialogTitle>
            <DialogDescription>
              {step === "credentials" ? copy.credentialsDescription : copy.standaloneDescription}
            </DialogDescription>
          </DialogHeader>
          {step === "credentials" ? credentialsForm : providerList}
        </DialogContent>
      </Dialog>
    );
  }

  const onPick = step === "pick";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!onPick && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back"
                onClick={() => setStep(step === "credentials" ? "connect" : "pick")}
                className="-ml-2 h-7 w-7"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {onPick ? copy.pickTitle : copy.connectTitle}
          </DialogTitle>
          <DialogDescription>
            {onPick
              ? copy.pickDescription
              : step === "credentials"
                ? copy.credentialsDescription
                : copy.connectDescription}
          </DialogDescription>
        </DialogHeader>

        <div
          style={{ height }}
          className="overflow-hidden transition-[height] duration-200 ease-out"
        >
          <div
            className={cn(
              "flex w-[300%] items-start transition-transform duration-200 ease-out",
              step === "connect" && "-translate-x-1/3",
              step === "credentials" && "-translate-x-2/3",
            )}
          >
            <div ref={setPickEl} inert={!onPick} className="w-1/3 shrink-0 pr-px">
              {policyNotice && (
                <p className="mb-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-[12px] text-foreground">
                  {policyNotice}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {attachable.length === 0 ? (
                  <p className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-[12px] text-faint">
                    {copy.emptyAttachable}
                  </p>
                ) : (
                  attachable.map((item) => {
                    const meta = resourceProviderMeta(resource, item.provider);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => attach(item.id)}
                        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:bg-hover disabled:opacity-50"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border">
                          <meta.Mark className="h-4 w-4" />
                        </div>
                        <AccountIdentity
                          email={item.email}
                          label={meta.label}
                          server={item.server}
                        />
                        {busyId === item.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />
                        )}
                      </button>
                    );
                  })
                )}

                <Button
                  variant="outline"
                  className="mt-1 h-auto justify-start gap-3 py-2.5"
                  onClick={() => setStep("connect")}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border">
                    <Plus className="h-4 w-4" />
                  </div>
                  <span className="text-[13px] font-medium">{copy.connectNew}</span>
                </Button>
              </div>
            </div>

            <div ref={setConnectEl} inert={step !== "connect"} className="w-1/3 shrink-0 px-px">
              {providerList}
            </div>

            <div
              ref={setCredentialsEl}
              inert={step !== "credentials"}
              className="w-1/3 shrink-0 pl-px"
            >
              {credentialsForm}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
