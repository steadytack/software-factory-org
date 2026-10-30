/// <reference lib="webworker" />
/** Parses data files off the main thread (see importData.ts). */
import { ImportError, parseData } from "./importData";

self.onmessage = async (e: MessageEvent<{ name: string; contents: ArrayBuffer }>) => {
  try {
    const layers = await parseData(e.data.name, e.data.contents);
    self.postMessage({ ok: true, layers });
  } catch (err) {
    self.postMessage({
      ok: false,
      message: err instanceof ImportError ? err.message : `Could not read ${e.data.name}.`,
    });
  }
};
