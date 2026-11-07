import type { AskResponse, ExpandResponse, SignPayload, SignResponse } from "../shared/types";

export interface DailyResponse {
  ok: true;
  question: string;
  sign: SignPayload;
  signToken: string;
  disclaimer: string;
}

const TIMEOUT_MS = 12_000;

async function request(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("这次等太久了，再试一次。");
    throw new Error("网络没接上，再试一次。");
  } finally {
    clearTimeout(timer);
  }
}

async function post<T>(payload: unknown): Promise<T> {
  const response = await request("/functions/v1/app", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.message ?? "请求失败，请稍后再试。");
  return data as T;
}

export function ask(question: string): Promise<AskResponse> {
  return post<AskResponse>({ action: "ask", question });
}

export async function daily(): Promise<DailyResponse> {
  const response = await request("/functions/v1/app?action=daily");
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.message ?? "今日一签暂时打不开。");
  return data as DailyResponse;
}

export function sign(token: string): Promise<SignResponse> {
  return post<SignResponse>({ action: "sign", token });
}

export function expand(token: string): Promise<ExpandResponse> {
  return post<ExpandResponse>({ action: "expand", token });
}
