type Field = string | number | boolean | null;

export function log(level: "info" | "error", event: string, fields: Record<string, Field> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.info(line);
}
