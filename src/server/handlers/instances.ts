/**
 * Evolution API-compatible instance management and webhook configuration
 * endpoint handlers (`fetchInstances`, `connectionState`, `create`,
 * `webhook/set`, and `webhook/find`).
 *
 * @packageDocumentation
 */

import type { ServerContext } from "../context";
import { parseJsonBody } from "./messages";

/**
 * Handles `GET /instance/fetchInstances`, returning the active simulated
 * Evolution API instance in `"open"` state.
 *
 * @param ctx - Shared server context.
 * @returns JSON array of Evolution API instance descriptors.
 */
export function handleFetchInstancesGet(ctx: ServerContext): Response {
  const settings = ctx.store.getSettings();
  return Response.json([
    {
      instance: {
        instanceName: settings.instanceName,
        instanceId: "mendel-instance",
        status: "open",
        state: "open",
      },
    },
  ]);
}

/**
 * Handles `GET /instance/connectionState/:instance`, reporting the requested
 * instance as `"open"`.
 *
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns JSON connection state object.
 */
export function handleConnectionStateGet(
  req: Bun.BunRequest<"/instance/connectionState/:instance">
): Response {
  return Response.json({
    instance: {
      instanceName: req.params.instance,
      state: "open",
    },
  });
}

/**
 * Handles `POST /instance/create`, updating the simulated instance name and
 * optional webhook URL.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request.
 * @returns Evolution API `201 Created` instance descriptor.
 */
export async function handleInstanceCreatePost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/instance/create">
): Promise<Response> {
  const body = await parseJsonBody(req);
  const instanceName =
    typeof body.instanceName === "string"
      ? body.instanceName
      : ctx.store.getSettings().instanceName;
  const webhookObj =
    typeof body.webhook === "object" && body.webhook !== null
      ? (body.webhook as Record<string, unknown>)
      : {};
  const webhookUrl =
    typeof webhookObj.url === "string"
      ? webhookObj.url
      : typeof body.webhook === "string"
        ? body.webhook
        : undefined;

  const updated = ctx.store.updateSettings({
    instanceName,
    webhookUrl,
  });
  ctx.bumpVersion();

  return Response.json(
    {
      instance: {
        instanceName: updated.instanceName,
        instanceId: "mendel-instance",
        status: "open",
      },
      hash: {
        apikey: updated.apiKey,
      },
    },
    { status: 201 }
  );
}

/**
 * Handles `POST /webhook/set/:instance`, updating the target webhook URL and
 * instance name in SQLite.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` webhook configuration response.
 */
export async function handleWebhookSetPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/webhook/set/:instance">
): Promise<Response> {
  const instance = req.params.instance;
  const body = await parseJsonBody(req);
  const nested =
    typeof body.webhook === "object" && body.webhook !== null
      ? (body.webhook as Record<string, unknown>)
      : body;
  const url =
    typeof nested.url === "string"
      ? nested.url
      : ctx.store.getSettings().webhookUrl;

  const updated = ctx.store.updateSettings({
    instanceName: instance,
    webhookUrl: url,
  });
  ctx.bumpVersion();

  return Response.json(
    {
      webhook: {
        instanceName: instance,
        webhook: {
          url: updated.webhookUrl,
          enabled: true,
          webhookBase64: true,
        },
      },
    },
    { status: 201 }
  );
}

/**
 * Handles `GET /webhook/find/:instance`, returning the current webhook URL and
 * subscribed events.
 *
 * @param ctx - Shared server context.
 * @returns JSON webhook configuration object.
 */
export function handleWebhookFindGet(ctx: ServerContext): Response {
  const settings = ctx.store.getSettings();
  return Response.json({
    enabled: true,
    url: settings.webhookUrl,
    webhookBase64: true,
    events: ["MESSAGES_UPSERT"],
  });
}
