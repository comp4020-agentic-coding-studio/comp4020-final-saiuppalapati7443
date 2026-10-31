import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterAll, expect, it } from "vitest";

// README promises what's dropped "survives a restart or redeploy" — only
// checkable by actually restarting a server process against the same
// DATA_DIR, which spec/global-setup.ts's shared running app can't do without
// disturbing every other spec file running concurrently against it. So, like
// spec/logging.test.ts, this spawns its own short-lived instances on a fresh
// temp DATA_DIR it owns outright.
let dataDir: string;
let server: ChildProcessWithoutNullStreams | undefined;

function startServer(port: number): Promise<ChildProcessWithoutNullStreams> {
  const proc = spawn("node", ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  });
  let stdout = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not boot in time")), 10_000);
    const check = (): void => {
      if (stdout.includes("cairn listening")) {
        clearTimeout(timeout);
        resolve(proc);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function stopServer(proc: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    proc.once("exit", () => resolve());
    proc.kill();
  });
}

interface StoneWire {
  id: number;
  color: string;
  x: number;
  rotation: number;
  mine: boolean;
}

function connect(port: number, cookie?: string): Promise<{ ws: WebSocket; setCookie: string | undefined }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, cookie ? { headers: { cookie } } : undefined);
    let setCookie: string | undefined;
    ws.once("upgrade", (res) => {
      const raw = res.headers["set-cookie"];
      setCookie = Array.isArray(raw) ? raw[0] : raw;
    });
    ws.once("open", () => resolve({ ws, setCookie }));
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket): Promise<{ type: string; stones?: StoneWire[]; stone?: StoneWire }> {
  return new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

afterAll(async () => {
  if (server) await stopServer(server);
  rmSync(dataDir, { recursive: true, force: true });
});

it("keeps a dropped stone, still attributed to its owner, after the server restarts on the same DATA_DIR", async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cairn-persistence-test-"));
  const port = 20000 + Math.floor(Math.random() * 10000);

  server = await startServer(port);
  const { ws, setCookie } = await connect(port);
  await nextMessage(ws); // initial state

  const dropped = nextMessage(ws);
  ws.send(JSON.stringify({ type: "drop", x: 0.44 }));
  const droppedMessage = await dropped;
  if (droppedMessage.type !== "stone" || !droppedMessage.stone) throw new Error("expected a stone broadcast");
  const stoneId = droppedMessage.stone.id;
  ws.close();

  await stopServer(server);
  server = await startServer(port);

  const again = await connect(port, setCookie);
  const state = await nextMessage(again.ws);
  if (state.type !== "state" || !state.stones) throw new Error("expected initial state");

  const survived = state.stones.find((stone) => stone.id === stoneId);
  expect(survived, "the stone placed before the restart must still be in the state sent after it").toBeTruthy();
  expect(survived?.x).toBeCloseTo(0.44);
  expect(survived?.mine, "the same cookie reconnecting after a restart must still see its own stone as mine").toBe(
    true,
  );

  again.ws.close();
}, 20_000);
