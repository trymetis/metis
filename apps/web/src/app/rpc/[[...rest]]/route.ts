import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { maintenanceResponse } from "@/maintenance/response";
import { router } from "@/server/routes";

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error("[orpc]", error);
    }),
  ],
});

async function handleRequest(request: Request) {
  const closed = maintenanceResponse(false, request.url);
  if (closed) return closed;

  const { response } = await handler.handle(request, {
    prefix: "/rpc",
    context: {},
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
