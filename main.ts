import { basename, dirname } from "jsr:@std/path";
import * as v from "https://deno.land/x/valibot/mod.ts";
import { ChatOllama } from "npm:@langchain/ollama";

const MessageSchema = v.object({
  id: v.number(),
  method: v.string(),
  params: v.unknown(),
});

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

      let packMetadata: v.InferInput<typeof PackMetadataSchema>;
      try {
        packMetadata = v.parse(
          PackMetadataSchema,
          JSON.parse(decoder.decode(await Deno.readFile(path))),
        );
      } catch (_) {
        // ignore partially written JSON
        continue;
      }

      await Deno.remove(packDir, { recursive: true });
      ids.add(id);

      const message = packMetadata.pack.description.hover_event
        .components["minecraft:custom_data"];
      try {
        await dispatch(message);
      } catch (e) {
        console.error(e);
      } finally {
        ids.delete(id);
      }
    }
  }
}

const ChatParamsSchema = v.object({
  message: v.string(),
});

async function dispatch(message: v.InferInput<typeof MessageSchema>) {
  switch (message.method) {
    case "ping": {
      await pong();
      break;
    }
    case "chat": {
      await chat(v.parse(ChatParamsSchema, message.params));
      break;
    }
  }
}

async function pong() {
  await execute(`say pong`);
}

const model = new ChatOllama({
  model: "gemma3:27b",
});

async function chat(params: v.InferInput<typeof ChatParamsSchema>) {
  const { content } = await model.invoke(["human", params.message]);
  if (typeof content === "string") {
    const escaped = [
      "",
      `[Client]`,
      params.message,
      "",
      "[Server]",
      ...content.split("\n"),
    ].map((line) => line.replaceAll('"', '\\"')).join("\\n");
    await execute(`tellraw @a "${escaped}"`);
  }
}

const encoder = new TextEncoder();

async function execute(command: string) {
  await stdin.write(encoder.encode(`${command}\n`));
}

main();
