import type { AskResponse, ExpandResponse, SignResponse } from "../shared/types";

async function post<T>(payload: unknown): Promise<T> {
  const response = await fetch("/functions/v1/app", {
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

export function sign(token: string): Promise<SignResponse> {
  return post<SignResponse>({ action: "sign", token });
}

export function expand(token: string): Promise<ExpandResponse> {
  return post<ExpandResponse>({ action: "expand", token });
}
