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
      instanceName: "default",
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
    expect(pageHtml).toContain("default");

    const form = new FormData();
    form.set("text", "Olá, testando envio de mensagem");

    const sendRes = await fetch(`${mendel.server.url.origin}/ui/send`, {
      method: "POST",
      body: form,
    });
    expect(sendRes.status).toBe(200);
    const fragment = await sendRes.text();
    expect(fragment).toContain("Olá, testando envio de mensagem");

    // Wait briefly for async webhook dispatch
    await Bun.sleep(50);

    expect(receivedWebhooks).toHaveLength(1);
    const wh = receivedWebhooks[0]!;
    expect(wh.headers["apikey"]).toBe("secret-key-123");
    expect(wh.body.event).toBe("messages.upsert");
    expect(wh.body.instance).toBe("default");

    const data = wh.body.data as Record<string, unknown>;
    const key = data.key as Record<string, unknown>;
    const message = data.message as Record<string, unknown>;

    expect(key.remoteJid).toBe("5511988887777@s.whatsapp.net");
    expect(key.fromMe).toBe(false);
    expect(message.conversation).toBe("Olá, testando envio de mensagem");
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
      `${mendel.server.url.origin}/message/sendText/default`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: "secret-key-123",
        },
        body: JSON.stringify({
          number: "5511988887777",
          text: "Processando sua mensagem...",
        }),
      }
    );
    expect(sendTextRes.status).toBe(201);
    const sendTextJson = (await sendTextRes.json()) as {
      key: { id: string; fromMe: boolean };
    };
    expect(sendTextJson.key.fromMe).toBe(true);
    const statusMsgId = sendTextJson.key.id;

    // 2. Insert an outgoing message after the initial status message, then edit
    // the earlier status message via updateMessage and verify it sorts after
    // the outgoing message.
    const userFollowUp = mendel.store.insertMessage({
      instance: "default",
      remoteJid: "5511988887777@s.whatsapp.net",
      direction: "outgoing",
      text: "1 - Configurar meu Perfil Agora",
    });

    const updateRes = await fetch(
      `${mendel.server.url.origin}/chat/updateMessage/default`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: "5511988887777",
          text: "✅ Mensagem atualizada!",
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
      "✅ Mensagem atualizada!"
    );
    expect(mendel.store.getMessage(statusMsgId)?.edited).toBe(true);
    const orderedIds = mendel.store.listMessages().map((m) => m.id);
    expect(orderedIds.indexOf(statusMsgId)).toBeGreaterThan(
      orderedIds.indexOf(userFollowUp.id)
    );

    // 3. sendMedia (base64 image from service)
    const sampleImg = new Uint8Array([1, 2, 3, 4, 5]);
    const sendMediaRes = await fetch(
      `${mendel.server.url.origin}/message/sendMedia/default`,
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
      `${mendel.server.url.origin}/message/sendButtons/default`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: "5511988887777",
          title: "Confirmar ação?",
          description: "Deseja continuar?",
          footer: "mendel",
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
    expect(uiHtml).toContain("✅ Mensagem atualizada!");
    expect(uiHtml).toContain("Gráfico semanal");
    expect(uiHtml).toContain("confirm_yes");
  });

  test("localizes UI in en-US, pt-BR, and fr-FR via Accept-Language", async () => {
    const enRes = await fetch(mendel.server.url.origin, {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    const enHtml = await enRes.text();
    expect(enHtml).toContain('<html lang="en-US"');
    expect(enHtml).toContain("No messages yet");
    expect(enHtml).toContain("Type a message or caption...");

    const ptRes = await fetch(mendel.server.url.origin, {
      headers: { "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8" },
    });
    const ptHtml = await ptRes.text();
    expect(ptHtml).toContain('<html lang="pt-BR"');
    expect(ptHtml).toContain("Nenhuma mensagem ainda");
    expect(ptHtml).toContain("Digite uma mensagem ou legenda...");

    const frRes = await fetch(mendel.server.url.origin, {
      headers: { "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    const frHtml = await frRes.text();
    expect(frHtml).toContain('<html lang="fr-FR"');
    expect(frHtml).toContain("Aucun message pour le moment");
    expect(frHtml).toContain("Écrivez un message ou une légende...");
  });

  test("renders WhatsApp markup (bold, italic, strikethrough, code, blockquote, lists)", async () => {
    await fetch(`${mendel.server.url.origin}/message/sendText/default`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: "5511988887777",
        text: [
          "👋 *Boas-vindas ao mendel*",
          "3. *Cardápios Flexíveis com 1 Toque:*",
          "4. *Minhas Receitas & Compartilhamento:*",
          "Para começarmos, *como posso te chamar?*",
          "Texto _itálico_, ~riscado~, `código *literal*` e ```bloco_mono```",
          "> 🔒 *Privacidade:* Seus dados são confidenciais.",
          "- Item *um*",
          "- Item _dois_",
        ].join("\n"),
      }),
    });

    const uiMessagesRes = await fetch(`${mendel.server.url.origin}/ui/messages`);
    const uiHtml = await uiMessagesRes.text();
    expect(uiHtml).toContain("<strong>Boas-vindas ao mendel</strong>");
    expect(uiHtml).toContain("<strong>Cardápios Flexíveis com 1 Toque:</strong>");
    expect(uiHtml).toContain(
      "<strong>Minhas Receitas &amp; Compartilhamento:</strong>"
    );
    expect(uiHtml).toContain("<strong>como posso te chamar?</strong>");
    expect(uiHtml).toContain("<em>itálico</em>");
    expect(uiHtml).toContain("<del>riscado</del>");
    expect(uiHtml).toContain(
      '<code class="wa-inline-code">código *literal*</code>'
    );
    expect(uiHtml).toContain(
      '<code class="wa-monospace">bloco_mono</code>'
    );
    expect(uiHtml).toContain(
      '<blockquote class="wa-quote">🔒 <strong>Privacidade:</strong> Seus dados são confidenciais.</blockquote>'
    );
    expect(uiHtml).toContain(
      '<ul class="wa-list"><li>Item <strong>um</strong></li><li>Item <em>dois</em></li></ul>'
    );
  });
});
