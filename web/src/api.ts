export async function api(
  path: string,
  method = "GET",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "You are offline or the server is unavailable. Reconnect and try again.",
    );
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "login")
      window.dispatchEvent(new Event("mb-auth-expired"));
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}
import type { Settings } from "../../shared/model";
export type SaveSettings = (
  settings: Settings,
  expectedRevision?: number,
) => Promise<number>;
