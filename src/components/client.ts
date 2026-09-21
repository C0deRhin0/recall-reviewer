import type { dashboard } from "@/server/service";
export type Dashboard = ReturnType<typeof dashboard>;
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = unknown>(
  path: string,
  data?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        data === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "X-Reviewer-Request": "1",
              "X-CSRF-Token": csrf,
            },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error(
      "We could not reach Recall. Check your connection and try again.",
    );
  }
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("auth/"))
    window.dispatchEvent(new Event("reviewer:session-expired"));
  if (!response.ok)
    throw new Error(
      result.error ||
        (response.status >= 500
          ? "Recall is temporarily unavailable. Please try again shortly."
          : "We could not complete that request. Please try again."),
    );
  return result;
}
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
      { type: typeof data === "string" ? "text/plain" : "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const modeNames: Record<string, string> = {
  mixed: "Mixed practice",
  category: "Category practice",
  mistakes: "Mistake review",
  bookmarks: "Saved questions",
  due: "Due for review",
  mock: "Timed mock",
  weighted: "Weighted practice",
};
export function date(value: string) {
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
