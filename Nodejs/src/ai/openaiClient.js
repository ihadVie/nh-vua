const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

const requestWithRetry = async (url, options, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (RETRY_STATUS.has(response.status) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError;
};

const getApiKey = () => process.env.OPENAI_API_KEY;

const chat = async (model, messages) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const response = await requestWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI chat error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
};

const chatWithTools = async ({ model, messages, tools, toolChoice = "auto" }) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const response = await requestWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: toolChoice
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI chat error: ${response.status} ${errorBody}`);
  }

  return response.json();
};

const image = async (prompt, size = "1024x1024") => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const response = await requestWithRetry(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || "gpt-image-1.5",
        prompt,
        size
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI image error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const first = data?.data?.[0] || {};
  return {
    url: first.url || null,
    b64_json: first.b64_json || null
  };
};

module.exports = {
  chat,
  chatWithTools,
  image
};
