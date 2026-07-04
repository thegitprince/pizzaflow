// src/lib/openrouter.ts
import { GoogleGenAI } from "@google/genai";

const MODEL = 'anthropic/claude-haiku-3'; // fast, cheap, counter-safe latency

export async function callOpenRouter(
  systemPrompt: string,
  userMessage: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  // Try OpenRouter first if key is available
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pizzaflow.vercel.app',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });
      if (!res.ok) throw new Error(`OpenRouter responded with status ${res.status}`);
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        return { ok: true, text: data.choices[0].message.content };
      }
      throw new Error("Invalid response format from OpenRouter");
    } catch (e) {
      console.error("OpenRouter error, falling back to Gemini:", e);
      // Fall through to Gemini fallback
    }
  }

  // Fallback to Gemini if OpenRouter is not set up or fails
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userMessage,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2, // low temperature for grounded statistics
        },
      });

      if (response.text) {
        return { ok: true, text: response.text };
      }
      throw new Error("Empty response from Gemini");
    } catch (e) {
      return { ok: false, error: `Both OpenRouter and Gemini fallback failed. Gemini Error: ${String(e)}` };
    }
  }

  return { ok: false, error: "No API keys configured (OPENROUTER_API_KEY or GEMINI_API_KEY)" };
}
