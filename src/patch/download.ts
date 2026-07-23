/** Trigger a browser download of `text` as `filename`. */
export function download(filename: string, text: string, type = "application/octet-stream"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Make a filesystem-safe base name from a user title. */
export function safeName(name: string): string {
  return (name.trim() || "untitled").replace(/[^\w.\- ]+/g, "_");
}
