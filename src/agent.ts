import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

// The shape of a single conversation turn.
// Keeping this explicit (no "magic" Message type from the SDK) means you
// can see exactly what goes to the LLM and swap providers later.
export type Message = {
  role: "user" | "assistant";
  content: string;
};

// streamAnswer sends the conversation history to the LLM and returns an
// async iterable of text chunks. The caller (cli.ts) owns printing them.
//
// Why return a stream instead of the full string?
// Streaming starts showing the user output immediately — for longer answers
// this feels much faster even if the total time is the same.
export async function streamAnswer(messages: Message[]) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const result = streamText({
    model: openai(model),
    system:
      "You are a helpful assistant. Answer questions clearly and concisely.",
    messages,
  });

  return result;
}
