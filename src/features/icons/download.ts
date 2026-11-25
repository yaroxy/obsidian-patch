import { requestUrl, type RequestUrlResponse } from "obsidian";

/** requestUrl cannot be aborted. A timeout releases the UI and ignores a late response. */
export async function downloadIconData(url: string): Promise<RequestUrlResponse> {
  let timer: number | undefined;
  try {
    const response = await Promise.race([
      requestUrl({ url, throw: false }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Timed out after 30 seconds")), 30_000);
      }),
    ]);
    if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} for ${url}`);
    return response;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}
