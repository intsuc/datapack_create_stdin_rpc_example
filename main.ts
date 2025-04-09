import { basename, dirname } from "jsr:@std/path";
import * as v from "https://deno.land/x/valibot/mod.ts";

const MessageSchema = v.object({
  id: v.number(),
  method: v.string(),
  params: v.unknown(),
});

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

type PackMetadata = v.InferInput<typeof PackMetadataSchema>;

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

const messages = new Map<string, Message>();
const decoder = new TextDecoder("utf-8");

const watcher = Deno.watchFs("world/datapacks");
for await (const event of watcher) {
  const path = event.paths[0];
  if (path !== undefined && basename(path) === "pack.mcmeta") {
    const packDir = dirname(path);
    const id = basename(packDir);

    if (messages.has(id)) {
      continue;
    }

    let packMetadata: PackMetadata;
    try {
      packMetadata = v.parse(
        PackMetadataSchema,
        JSON.parse(decoder.decode(await Deno.readFile(path))),
      );
    } catch (_) {
      continue;
    }
    const message = packMetadata.pack.description.hover_event
      .components["minecraft:custom_data"];
    messages.set(id, message);

    await Deno.remove(packDir, { recursive: true });

    stdin.write(
      new TextEncoder().encode(`say ${JSON.stringify(message)}\n`),
    );
  }
}
