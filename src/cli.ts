import * as readline from "readline";
import * as dotenv from "dotenv";
import { streamAnswer, Message } from "./agent";

dotenv.config();

// Run with `npm run dev -- --debug` to enable step-by-step trace lines.
const DEBUG = process.argv.includes("--debug");
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function dbg(msg: string) {
  if (DEBUG) console.log(dim(`  › ${msg}`));
}

const history: Message[] = [];

// terminal: false tells readline not to manage the terminal (no cursor control,
// no line clearing). Without this, readline's internal terminal management
// fights with the spinner's \r writes and the spinner never renders.
// We write the prompt ourselves and read lines via rl.once("line", ...).
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

async function main() {
  console.log('Search Agent — type your question, or "exit" to quit.\n');

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
    let stopSpinner = DEBUG ? noSpinner : startSpinner("Thinking…");

    try {
      const stream = await streamAnswer(history);
      let firstText = true;

      for await (const event of stream.fullStream) {
        switch (event.type) {
          case "tool-call": {
            const query = (event.input as { query: string }).query;
            dbg(`tool called — webSearch("${query}")`);
            if (!DEBUG) {
              stopSpinner();
              stopSpinner = startSpinner(`Searching: "${query}"…`);
            }
            break;
          }
          case "tool-result": {
            dbg("tool result received");
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
    } catch (err) {
      stopSpinner();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      history.pop();
      continue;
    }

    history.push({ role: "assistant", content: fullResponse });
    console.log("\n");
  }
}

main();
