#!/usr/bin/env bun
import { parseArgs, UsageError } from "./args.js";
import { helpText, runCommand } from "./commands.js";
import { exitCodeFor, printError, printJson } from "./output.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const json = argv.includes("--json");
  try {
    const args = parseArgs(argv);
    if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
      if (json) printJson({ schema: "qtape.cli.v1", ok: true, data: { help: helpText() } });
      else console.log(helpText());
      return 0;
    }
    const result = await runCommand(args);
    if (json) printJson({ schema: "qtape.cli.v1", ok: true, command: result.command, data: result.data });
    else {
      if (result.command === "inspect") printHumanInspection(result.data);
      else printJson(result.data);
    }
    return 0;
  } catch (error) {
    printError(error, json);
    if (error instanceof UsageError && !json) console.error("Run qtape --help for usage.");
    return exitCodeFor(error);
  }
}

function printHumanInspection(data: unknown): void {
  const site = data as {
    site: string;
    chainId: number;
    blockNumber: string;
    blockHash: string;
    processor: string;
    container: string;
    holder: string;
    protection: string;
    opened: boolean;
    live: boolean;
    warnings: string[];
  };
  console.log(`site:        ${site.site}`);
  console.log(`chain:       ${site.chainId}`);
  console.log(`block:       ${site.blockNumber} (${site.blockHash})`);
  console.log(`processor:   ${site.processor}`);
  console.log(`container:   ${site.container}`);
  console.log(`holder:      ${site.holder}`);
  console.log(`opened:      ${site.opened}`);
  console.log(`paid:        ${site.live}`);
  console.log(`protection:  ${site.protection}`);
  for (const warning of site.warnings) console.log(`warning:     ${warning}`);
}

if (import.meta.main) {
  process.exit(await main());
}
