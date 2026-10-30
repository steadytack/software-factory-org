/** Read a data file into layers without blocking the page: size check
 *  first, then parsing in a Web Worker (on the main thread only where
 *  workers aren't available, e.g. tests). */
import { ImportError, checkSize, parseData, type ImportedLayer } from "./importData";

export interface ImportResult {
  layers: ImportedLayer[];
  warning: string | null;
}

export async function importFile(file: File): Promise<ImportResult> {
  const warning = checkSize(file.name, file.size);
  const contents = await file.arrayBuffer();
  if (typeof Worker === "undefined") return { layers: await parseData(file.name, contents), warning };
  const worker = new Worker(new URL("./importWorker.ts", import.meta.url), { type: "module" });
  try {
    const reply = await new Promise<{ ok: boolean; layers?: ImportedLayer[]; message?: string }>((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = () => reject(new ImportError(`Could not read ${file.name} (it may be too big for this device).`));
      worker.postMessage({ name: file.name, contents }, [contents]);
    });
    if (!reply.ok) throw new ImportError(reply.message ?? `Could not read ${file.name}.`);
    return { layers: reply.layers ?? [], warning };
  } finally {
    worker.terminate();
  }
}
