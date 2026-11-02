export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export class CancelledError extends Error {
  constructor(message = "user cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
  lists: Map<string, string[]>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const lists = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    if (token === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    if (body.length === 0) throw new UsageError("empty flag");
    const equals = body.indexOf("=");
    const name = equals === -1 ? body : body.slice(0, equals);
    if (name === "rpc") {
      const value = equals === -1 ? argv[++index] : body.slice(equals + 1);
      if (!value || value.startsWith("--")) throw new UsageError("--rpc requires a value");
      const current = lists.get("rpc") ?? [];
      current.push(value);
      lists.set("rpc", current);
      continue;
    }
    if (equals === -1) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        index++;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    flags.set(name, body.slice(equals + 1));
  }
  return { positional, flags, lists };
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  if (value === undefined) return undefined;
  if (value === true) throw new UsageError(`--${name} requires a value`);
  return value;
}

export function requireFlag(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (!value) throw new UsageError(`--${name} is required`);
  return value;
}

export function boolFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

export function rpcUrls(args: ParsedArgs): string[] | undefined {
  return args.lists.get("rpc");
}
