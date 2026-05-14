import * as readline from "readline";
import * as dotenv from "dotenv";
import { streamAnswer, summarizeHistory, Message, MAX_STEPS, TOKEN_TRIM_THRESHOLD, KEEP_TURNS } from "./agent";
import type { SearchResponse } from "./tools";
import { createSessionFile, appendMessage, loadSession, getMostRecentSession, sessionSummary } from "./sessions";

dotenv.config();

// Run with `npm run dev -- --debug` to enable step-by-step trace lines.
const DEBUG = process.argv.includes("--debug");
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// --session <file>  load a specific past session on startup
const sessionFlagIdx = process.argv.indexOf("--session");
const sessionFlagFile = sessionFlagIdx !== -1 ? process.argv[sessionFlagIdx + 1] : null;

function dbg(msg: string) {
  if (DEBUG) console.log(dim(`  › ${msg}`));
}

const history: Message[] = [];

// terminal: false prevents readline from doing its own cursor/line management,
// which would fight with the spinner's \r writes. Prompts are written manually.
const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => rl.once("line", resolve));
}

function startSpinner(text: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i]} ${text}`);
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(timer);
    process.stdout.write(`\r${" ".repeat(text.length + 2)}\r`);
  };
}

const noSpinner = () => {};

function printSources(sources: Array<{ title: string; url: string }>) {
  if (sources.length === 0) return;
  const seen = new Set<string>();
  const unique = sources.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  console.log(dim("\nSources:"));
  unique.forEach(({ title, url }, i) => {
    console.log(dim(`  ${i + 1}. ${title}`));
    console.log(dim(`     ${url}`));
  });
}

async function main() {
  console.log('Search Agent — type your question, or "exit" to quit.\n');

  // --- Session setup ---
  // Decide which session file to use and whether to pre-load history.
  let fileToLoad = sessionFlagFile;

  if (!fileToLoad) {
    const recent = getMostRecentSession();
    if (recent) {
      const answer = await prompt(
        `Resume last session (${sessionSummary(recent)})? (y/n) `
      );
      console.log();
      if (answer.trim().toLowerCase().startsWith("y")) {
        fileToLoad = recent;
      }
    }
  }

  // Every run writes to a new file, even when resuming.
  // Loading a session pre-populates history; new turns append to the fresh file.
  const sessionFile = createSessionFile();

  if (fileToLoad) {
    try {
      const loaded = loadSession(fileToLoad);
      history.push(...loaded);
      // Mirror the loaded messages into the new file so it's self-contained.
      for (const msg of loaded) appendMessage(sessionFile, msg);
      console.log(dim(`  Loaded ${loaded.length} messages.\n`));
    } catch {
      console.error(`Could not load session: ${fileToLoad}\n`);
    }
  }

  console.log(dim(`  Session: ${sessionFile}\n`));

  // --- Main loop ---
  while (true) {
    const userInput = (await prompt("You: ")).trim();

    if (!userInput) continue;
    if (userInput.toLowerCase() === "exit") {
      console.log("Goodbye.");
      rl.close();
      break;
    }

    history.push({ role: "user", content: userInput });

    let fullResponse = "";
    let searchCount = 0;
    const sources: Array<{ title: string; url: string }> = [];
    let stopSpinner = DEBUG ? noSpinner : startSpinner("Thinking…");
    let inputTokens = 0;

    try {
      const stream = await streamAnswer(history);
      let firstText = true;

      for await (const event of stream.fullStream) {
        switch (event.type) {
          case "tool-call": {
            if (event.toolName === "webSearch") {
              searchCount++;
              const query = (event.input as { query: string }).query;
              dbg(`search ${searchCount}/${MAX_STEPS} — "${query}"`);
              if (!DEBUG) {
                stopSpinner();
                const label =
                  searchCount > 1
                    ? `Searching (${searchCount}/${MAX_STEPS}): "${query}"…`
                    : `Searching: "${query}"…`;
                stopSpinner = startSpinner(label);
              }
            } else if (event.toolName === "reflect") {
              const input = event.input as { reasoning: string; hasEnoughInfo: boolean };
              dbg(`reflect — ${input.hasEnoughInfo ? "has enough info" : "needs more search"}`);
              dbg(`  ${input.reasoning}`);
              if (!DEBUG) {
                stopSpinner();
                stopSpinner = startSpinner("Reflecting…");
              }
            }
            break;
          }

          case "tool-result": {
            if (event.toolName === "webSearch") {
              const result = event.output as SearchResponse;
              for (const r of result.results) {
                sources.push({ title: r.title, url: r.url });
              }
            }
            if (!DEBUG) {
              stopSpinner();
              stopSpinner = startSpinner("Thinking…");
            }
            break;
          }

          case "text-delta": {
            if (firstText) {
              stopSpinner();
              process.stdout.write("\nAssistant: ");
              firstText = false;
            }
            process.stdout.write(event.text);
            fullResponse += event.text;
            break;
          }

          case "error": {
            throw event.error;
          }
        }
      }

      if (firstText) stopSpinner();
      ({ inputTokens = 0 } = await stream.usage);
    } catch (err) {
      stopSpinner();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      history.pop();
      continue;
    }

    history.push({ role: "assistant", content: fullResponse });

    // Persist both turns immediately — safe even if the process is killed next.
    appendMessage(sessionFile, history[history.length - 2]); // user turn
    appendMessage(sessionFile, history[history.length - 1]); // assistant turn

    printSources(sources);
    console.log("\n");

    if (inputTokens > TOKEN_TRIM_THRESHOLD && history.length > KEEP_TURNS + 2) {
      try {
        process.stdout.write(dim("  (compressing earlier context…)\n\n"));
        const summary = await summarizeHistory(history.slice(0, -KEEP_TURNS));
        history.splice(
          0,
          history.length - KEEP_TURNS,
          { role: "user", content: `[Summary of earlier conversation]\n${summary}` },
          { role: "assistant", content: "Understood." }
        );
      } catch {
        // Summarisation failed — leave history untouched.
      }
    }
  }
}

main();
