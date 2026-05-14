import * as readline from "readline";
import * as dotenv from "dotenv";
import { streamAnswer, Message } from "./agent";

// Load .env before anything else touches process.env.
// dotenv.config() is a no-op if the key is already set (e.g. in CI),
// so this is safe to leave in production builds too.
dotenv.config();

// Conversation history accumulates every turn.
// Passing the full history on each call is how LLMs maintain context —
// they are stateless, so "memory" lives in the caller.
const history: Message[] = [];

// readline gives us a simple prompt loop without any external dependency.
// We use process.stdin / stdout directly so this works in any terminal.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Cycles through braille dot frames every 80ms and writes them in-place
// using \r (carriage return) to overwrite the same terminal line.
// Returns a stop function that clears the line so streaming output
// starts clean from column 0.
function startSpinner(text: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i]} ${text}`);
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(timer);
    // Overwrite the spinner line with spaces, then reset cursor to column 0.
    process.stdout.write(`\r${" ".repeat(text.length + 2)}\r`);
  };
}

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

    // Add the user's turn to history before calling the LLM.
    history.push({ role: "user", content: userInput });

    let fullResponse = "";

    // Spinner runs while we wait for the first token from the model.
    // There's a short but noticeable delay between sending the request
    // and receiving the first streamed chunk — the spinner fills that gap.
    const stopSpinner = startSpinner("Thinking…");

    try {
      const stream = await streamAnswer(history);

      let firstChunk = true;
      for await (const chunk of stream.textStream) {
        if (firstChunk) {
          // Clear the spinner and print the label only when output actually starts.
          stopSpinner();
          process.stdout.write("\nAssistant: ");
          firstChunk = false;
        }
        process.stdout.write(chunk);
        fullResponse += chunk;
      }

      // Edge case: stream returned no chunks at all.
      if (firstChunk) stopSpinner();
    } catch (err) {
      stopSpinner();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError: ${message}`);
      // Remove the user turn we just added so the broken turn isn't in history.
      history.pop();
      continue;
    }

    // Save the assistant's full response to history so future turns have context.
    history.push({ role: "assistant", content: fullResponse });

    console.log("\n");
  }
}

main();
