import { mkdir } from "node:fs/promises";

type BootstrapRequest = {
  appKey: string;
  dataDir: string;
  accId: string;
  token: string;
  roomNumber: number;
};

type NimClientLike = {
  init(appKey: string, appDataDir: string, appInstallDir: string, config: Record<string, unknown>): boolean;
  initEventHandlers(): void;
  login(appKey: string, account: string, password: string, cb: null, extension: string): Promise<[unknown]>;
};

type NimPluginLike = {
  initEventHandlers(): void;
  chatRoomRequestEnterAsync(roomId: number, cb: null, extension: string): Promise<[number, string]>;
};

type NodeNimModule = {
  NIMClient: new () => NimClientLike;
  NIMPlugin: new () => NimPluginLike;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(request: BootstrapRequest): Promise<[number, string]> {
  await mkdir(request.dataDir, { recursive: true });

  const imported = await import("node-nim");
  const candidate = (imported as { default?: unknown }).default ?? imported;
  const nim = candidate as Partial<NodeNimModule>;

  if (typeof nim.NIMClient !== "function" || typeof nim.NIMPlugin !== "function") {
    throw new Error("node-nim NIMClient/NIMPlugin exports are unavailable");
  }

  const client = new nim.NIMClient();
  const plugin = new nim.NIMPlugin();

  const config = {
    database_encrypt_key_: request.appKey,
    use_https_: true,
    sdk_log_level_: 2,
    login_max_retry_times_: 6,
    need_update_lbs_befor_relogin_: true,
    ip_protocol_version_: 0,
  };

  if (!client.init(request.appKey, request.dataDir + "/", "", config)) {
    throw new Error("NIM bootstrap client initialization failed");
  }

  client.initEventHandlers();
  plugin.initEventHandlers();

  const [loginResult] = await client.login(
    request.appKey,
    request.accId,
    request.token,
    null,
    "",
  );

  const result = asRecord(loginResult);
  const loginCode = readNumber(result.res_code_);
  if (loginCode !== 200) {
    throw new Error(
      "NIM login failed" +
      (loginCode === null ? "" : " code=" + loginCode),
    );
  }
  return await plugin.chatRoomRequestEnterAsync(
    request.roomNumber,
    null,
    "",
  );
}

let started = false;

process.on("message", (raw: unknown) => {
  if (started) return;
  started = true;

  void run(raw as BootstrapRequest)
    .then((result) => {
      process.send?.({ ok: true, result });
    })
    .catch((error) => {
      process.send?.({
        ok: false,
        error: error instanceof Error ? error.message : "unknown bootstrap error",
      });
    });
});

// Never perform node-nim cleanup in this process.
// The parent kills this short-lived process after it receives a result.
setInterval(() => {}, 60_000);