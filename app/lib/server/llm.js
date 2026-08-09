const fetch = require("node-fetch");

/**
 * Calls a real LLM if GROQ_API_KEY / OPENROUTER_API_KEY is set.
 * Falls back to a clearly-labelled stub with an artificial delay so the
 * rest of the engine (retries, conditional branching) still has something
 * real to operate on when no key is configured.
 */
async function callLLM({ prompt, model }) {
  if (process.env.GROQ_API_KEY) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM call failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return { text: data.choices[0].message.content, stubbed: false };
  }

  // --- disclosed stub ---
  await new Promise((r) => setTimeout(r, 800));
  const lower = prompt.toLowerCase();
  const positive = /good|success|approve|yes|positive/.test(lower);
  return {
    text: positive
      ? "STUB RESPONSE (no GROQ_API_KEY set): Looks positive, proceed."
      : "STUB RESPONSE (no GROQ_API_KEY set): Needs review before proceeding.",
    stubbed: true,
  };
}

module.exports = { callLLM };
