export async function generateOllamaStream(
  prompt: string, 
  model: string, 
  system: string = "You are a helpful personal AI assistant analyzing personal data. Always answer thoughtfully and concisely based strictly on the provided context."
) {
  const payload = {
    model,
    system,
    prompt,
    stream: true,
  };

  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  return response.body as ReadableStream<Uint8Array>;
}
