import { basename, dirname } from "jsr:@std/path";
import * as v from "https://deno.land/x/valibot/mod.ts";
import { ChatOllama } from "npm:@langchain/ollama";

const MessageSchema = v.variant("method", [
  v.object({
    id: v.number(),
    method: v.literal("ping"),
    params: v.object({}),
  }),
  v.object({
    id: v.number(),
    method: v.literal("chat"),
    params: v.object({
      message: v.string(),
    }),
  }),
  v.object({
    id: v.number(),
    method: v.literal("sum"),
    params: v.object({
      a: v.number(),
      b: v.number(),
    }),
    callback: v.string(),
  }),
]);

type Message = v.InferInput<typeof MessageSchema>;

const PackMetadataSchema = v.object({
  pack: v.object({
    description: v.object({
      text: v.literal(""),
      hover_event: v.object({
        id: v.literal("minecraft:map"),
        count: v.literal(1),
        components: v.object({
          "minecraft:custom_data": MessageSchema,
        }),
        action: v.literal("show_item"),
      }),
    }),
    pack_format: v.number(),
  }),
});

const command = new Deno.Command("java", {
  args: [
    "-jar",
    "server.jar",
    "--nogui",
  ],
  stdin: "piped",
  stdout: "inherit",
});
const child = command.spawn();
const stdin = child.stdin.getWriter();
const encoder = new TextEncoder();

async function execute(command: string) {
  await stdin.write(encoder.encode(`${command}\n`));
}

async function main() {
  const decoder = new TextDecoder("utf-8");
  const ids = new Set<string>();

  const watcher = Deno.watchFs("world/datapacks");
  for await (const event of watcher) {
    const path = event.paths[0];
    if (path !== undefined && basename(path) === "pack.mcmeta") {
      const packDir = dirname(path);
      const id = basename(packDir);

      if (ids.has(id)) {
        continue;
      }

      let packMetadataJson: string;
      try {
        packMetadataJson = JSON.parse(
          decoder.decode(await Deno.readFile(path)),
        );
      } catch (_) {
        // ignore partially written JSON
        continue;
      }

      await Deno.remove(packDir, { recursive: true });
      ids.add(id);

      try {
        const packMetadata = v.parse(PackMetadataSchema, packMetadataJson);
        const message = packMetadata.pack.description.hover_event
          .components["minecraft:custom_data"];
        await dispatch(message);
      } catch (e) {
        console.error(e);
      } finally {
        ids.delete(id);
      }
    }
  }
}

async function dispatch(message: Message) {
  switch (message.method) {
    case "ping":
      return await ping(message);
    case "chat":
      return await chat(message);
    case "sum":
      return await sum(message);
  }
}

async function ping({}: Message & { method: "ping" }) {
  await execute(`say pong`);
}

const model = new ChatOllama({
  model: "gemma3:27b",
});

async function chat({ params: { message } }: Message & { method: "chat" }) {
  const { content } = await model.invoke(["human", message]);
  if (typeof content === "string") {
    const escaped = [
      "",
      `[Client]`,
      message,
      "",
      "[Server]",
      ...content.split("\n"),
    ].map((line) => line.replaceAll('"', '\\"')).join("\\n");
    await execute(`tellraw @a "${escaped}"`);
  }
}

async function sum(
  { params: { a, b }, callback }: Message & { method: "sum" },
) {
  const result = a + b;
  await execute(`function ${callback} ${JSON.stringify({ result })}`);
}

main();
