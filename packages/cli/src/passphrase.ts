import { CancelledError, UsageError } from "./args.js";

let stdinLines: string[] | null = null;

export async function readPassphrase(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    if (stdinLines === null) {
      let text = "";
      for await (const chunk of process.stdin) text += Buffer.from(chunk).toString("utf8");
      stdinLines = text.split(/\r?\n/);
    }
    const line = stdinLines.shift();
    if (line === undefined) throw new UsageError("passphrase is required on stdin for non-interactive use");
    return line;
  }
  return await new Promise<string>((resolve, reject) => {
    const stdin = process.stdin;
    const stderr = process.stderr;
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (data: string) => {
      for (const char of data) {
        if (char === "\u0003") {
          cleanup();
          reject(new CancelledError());
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

export async function readNewPassphrase(): Promise<string> {
  const first = await readPassphrase("New backup passphrase: ");
  if (first.length < 12) throw new UsageError("backup passphrase must be at least 12 characters");
  const second = await readPassphrase("Repeat backup passphrase: ");
  if (first !== second) throw new UsageError("passphrases do not match");
  return first;
}
