import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMendelServer } from "../src/server";

describe("mendel server", () => {
  let mendel: ReturnType<typeof createMendelServer>;
  let webhookServer: ReturnType<typeof Bun.serve>;
  let receivedWebhooks: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  beforeEach(() => {
    receivedWebhooks = [];
    webhookServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (req) => {
        const body = (await req.json()) as Record<string, unknown>;
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          headers[k] = v;
        });
        receivedWebhooks.push({ headers, body });
        return Response.json({ status: "queued" });
      },
    });

    mendel = createMendelServer({
      port: 0,
      hostname: "127.0.0.1",
      dbPath: ":memory:",
    });

    mendel.store.updateSettings({
      webhookUrl: `${webhookServer.url.origin}/whatsapp`,
      instanceName: "dietia",
      apiKey: "secret-key-123",
      senderNumber: "5511988887777",
      pushName: "Alice",
    });
  });

  afterEach(() => {
    mendel.stop();
    webhookServer.stop(true);
  });

  test("renders chat UI and dispatches text message webhook", async () => {
    const pageRes = await fetch(mendel.server.url.origin);
    expect(pageRes.status).toBe(200);
    const pageHtml = await pageRes.text();
    expect(pageHtml).toContain("mendel");
    expect(pageHtml).toContain("dietia");

    const form = new FormData();
    form.set("text", "Oi DietIA, almocei arroz e feijão");

    const sendRes = await fetch(`${mendel.server.url.origin}/ui/send`, {
      method: "POST",
      body: form,
    });
    expect(sendRes.status).toBe(200);
    const fragment = await sendRes.text();
    expect(fragment).toContain("Oi DietIA, almocei arroz e feijão");

    // Wait briefly for async webhook dispatch
    await Bun.sleep(50);

    expect(receivedWebhooks).toHaveLength(1);
    const wh = receivedWebhooks[0]!;
    expect(wh.headers["apikey"]).toBe("secret-key-123");
    expect(wh.body.event).toBe("messages.upsert");
    expect(wh.body.instance).toBe("dietia");

    const data = wh.body.data as Record<string, unknown>;
    const key = data.key as Record<string, unknown>;
    const message = data.message as Record<string, unknown>;

    expect(key.remoteJid).toBe("5511988887777@s.whatsapp.net");
    expect(key.fromMe).toBe(false);
    expect(message.conversation).toBe("Oi DietIA, almocei arroz e feijão");
  });

  test("dispatches image and video messages with base64 and serves /media/:id", async () => {
    const imgBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const imgForm = new FormData();
    imgForm.set("text", "Foto do prato");
    imgForm.set(
      "media",
      new File([imgBytes], "meal.png", { type: "image/png" })
    );

    const imgRes = await fetch(`${mendel.server.url.origin}/ui/send`, {
      method: "POST",
      body: imgForm,
    });
    expect(imgRes.status).toBe(200);
    const imgHtml = await imgRes.text();
    expect(imgHtml).toContain("<img class=\"message-media\"");
    expect(imgHtml).toContain("Foto do prato");

    const vidBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const vidForm = new FormData();
    vidForm.set("text", "Vídeo da refeição");
    vidForm.set(
      "media",
      new File([vidBytes], "meal.mp4", { type: "video/mp4" })
    );

    const vidRes = await fetch(`${mendel.server.url.origin}/ui/send`, {
      method: "POST",
      body: vidForm,
    });
    expect(vidRes.status).toBe(200);
    const vidHtml = await vidRes.text();
    expect(vidHtml).toContain("<video class=\"message-media\"");

    await Bun.sleep(50);

    expect(receivedWebhooks).toHaveLength(2);

    const imgWhData = receivedWebhooks[0]!.body.data as Record<string, unknown>;
    const imgWhMsg = imgWhData.message as Record<string, unknown>;
    expect(imgWhData.messageType).toBe("imageMessage");
    expect(imgWhMsg.base64).toBe(imgBytes.toBase64());
    expect((imgWhMsg.imageMessage as Record<string, unknown>).caption).toBe(
      "Foto do prato"
    );

    const vidWhData = receivedWebhooks[1]!.body.data as Record<string, unknown>;
    const vidWhMsg = vidWhData.message as Record<string, unknown>;
    expect(vidWhData.messageType).toBe("videoMessage");
    expect(vidWhMsg.base64).toBe(vidBytes.toBase64());
    expect((vidWhMsg.videoMessage as Record<string, unknown>).caption).toBe(
      "Vídeo da refeição"
    );

    // Verify /media/:id endpoint and Range support
    const messages = mendel.store.listMessages();
    const vidMsg = messages[1]!;
    const rangeRes = await fetch(
      `${mendel.server.url.origin}/media/${vidMsg.id}`,
      {
        headers: { Range: "bytes=0-3" },
      }
    );
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get("content-type")).toBe("video/mp4");
    const partial = new Uint8Array(await rangeRes.arrayBuffer());
    expect(partial).toEqual(vidBytes.subarray(0, 4));
  });

  test("handles Evolution API sendText, updateMessage, sendMedia, and sendButtons", async () => {
    // 1. sendText
    const sendTextRes = await fetch(
      `${mendel.server.url.origin}/message/sendText/dietia`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: "secret-key-123",
        },
        body: JSON.stringify({
          number: "5511988887777",
          text: "Processando sua refeição...",
        }),
      }
    );
    expect(sendTextRes.status).toBe(201);
    const sendTextJson = (await sendTextRes.json()) as {
      key: { id: string; fromMe: boolean };
    };
    expect(sendTextJson.key.fromMe).toBe(true);
    const statusMsgId = sendTextJson.key.id;

    // 2. updateMessage
    const updateRes = await fetch(
      `${mendel.server.url.origin}/chat/updateMessage/dietia`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: "5511988887777",
          text: "✅ Refeição registrada: 450 kcal!",
          key: {
            remoteJid: "5511988887777@s.whatsapp.net",
            fromMe: true,
            id: statusMsgId,
          },
        }),
      }
    );
    expect(updateRes.status).toBe(200);
    expect(mendel.store.getMessage(statusMsgId)?.text).toBe(
      "✅ Refeição registrada: 450 kcal!"
    );
    expect(mendel.store.getMessage(statusMsgId)?.edited).toBe(true);

    // 3. sendMedia (base64 image from service)
    const sampleImg = new Uint8Array([1, 2, 3, 4, 5]);
    const sendMediaRes = await fetch(
      `${mendel.server.url.origin}/message/sendMedia/dietia`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: "5511988887777",
          mediatype: "image",
          mimetype: "image/png",
          caption: "Gráfico semanal",
          media: sampleImg.toBase64(),
          fileName: "report.png",
        }),
      }
    );
    expect(sendMediaRes.status).toBe(201);

    // 4. sendButtons & interactive reply
    const sendBtnsRes = await fetch(
      `${mendel.server.url.origin}/message/sendButtons/dietia`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: "5511988887777",
          title: "Confirmar registro?",
          description: "Deseja salvar esta refeição?",
          footer: "DietIA",
          buttons: [
            { buttonId: "confirm_yes", buttonText: { displayText: "Sim" } },
            { buttonId: "confirm_no", buttonText: { displayText: "Não" } },
          ],
        }),
      }
    );
    expect(sendBtnsRes.status).toBe(201);

    const uiMessagesRes = await fetch(`${mendel.server.url.origin}/ui/messages`);
    const uiHtml = await uiMessagesRes.text();
    expect(uiHtml).toContain("✅ Refeição registrada: 450 kcal!");
    expect(uiHtml).toContain("Gráfico semanal");
    expect(uiHtml).toContain("confirm_yes");
  });
});
