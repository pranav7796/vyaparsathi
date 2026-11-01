const API = "https://agent.tinyfish.ai";
const TIMEOUT_MS = 30_000;

type TinyFishError = { message?: string; code?: string };
type TinyFishRun = {
  run_id?: string | null;
  status?: string;
  result?: unknown;
  error?: TinyFishError | null;
};

function parseResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    throw new Error("TinyFish result was not valid JSON");
  }
}

type AgentStep = { screenshot?: string | null };

async function execute(
  url: string,
  goal: string,
  capture: boolean,
  timeoutMs = TIMEOUT_MS,
): Promise<{ result: unknown; screenshot: string | null }> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) throw new Error("TINYFISH_API_KEY is not set");

  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
  const deadline = Date.now() + timeoutMs;
  const payload: Record<string, unknown> = {
    url,
    goal,
    browser_profile: "stealth",
    proxy_config: { enabled: true, country_code: "IN" },
    agent_config: { max_duration_seconds: Math.min(30, Math.ceil(timeoutMs / 1000)) },
  };
  if (capture) payload.capture_config = { screenshots: true };

  let queued: TinyFishRun;
  try {
    const response = await fetch(`${API}/v1/automation/run-async`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Math.min(20_000, timeoutMs)),
    });
    queued = (await response.json().catch(() => null)) as TinyFishRun;
    if (response.status === 403 && capture) return execute(url, goal, false);
    if (!response.ok || !queued?.run_id) {
      throw new Error(
        `TinyFish request failed (${response.status}): ${queued?.error?.message ?? "no run id"}`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TinyFish")) throw error;
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? `TinyFish run timed out after ${Math.round(timeoutMs / 1000)}s`
        : `TinyFish run failed: ${error instanceof Error ? error.message : "request failed"}`,
    );
  }

  while (Date.now() < deadline) {
    const response = await fetch(
      `${API}/v1/runs/${queued.run_id}?screenshots=${capture ? "url" : "none"}`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(8_000) },
    );
    const run = (await response.json().catch(() => null)) as
      | (TinyFishRun & { steps?: AgentStep[] })
      | null;
    if (!response.ok) {
      throw new Error(
        `TinyFish request failed (${response.status}): ${run?.error?.message ?? response.statusText}`,
      );
    }
    if (run?.status === "COMPLETED") {
      if (run.result == null) throw new Error("TinyFish run failed: no result");
      const shot = [...(run.steps ?? [])]
        .reverse()
        .find((step) => typeof step.screenshot === "string")?.screenshot;
      return { result: parseResult(run.result), screenshot: shot ?? null };
    }
    if (run?.status === "FAILED" || run?.status === "CANCELLED") {
      throw new Error(`TinyFish run failed: ${run.error?.message ?? run.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const last = await fetch(
    `${API}/v1/runs/${queued.run_id}?screenshots=${capture ? "url" : "none"}`,
    { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(8_000) },
  );
  const lastRun = (await last.json().catch(() => null)) as
    | (TinyFishRun & { steps?: AgentStep[] })
    | null;
  if (lastRun?.status === "COMPLETED" && lastRun.result != null) {
    const shot = [...(lastRun.steps ?? [])]
      .reverse()
      .find((step) => typeof step.screenshot === "string")?.screenshot;
    return { result: parseResult(lastRun.result), screenshot: shot ?? null };
  }

  throw new Error(`TinyFish run timed out after ${Math.round(timeoutMs / 1000)}s`);
}

export async function runAgent(url: string, goal: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  return (await execute(url, goal, false, timeoutMs)).result;
}

export async function runAgentCapture(
  url: string,
  goal: string,
  timeoutMs = TIMEOUT_MS,
): Promise<{ result: unknown; screenshot: string | null }> {
  return execute(url, goal, true, timeoutMs);
}

