export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma',
        prompt: text
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create embedding from Ollama: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error("Ollama Embedding Error:", error);
    throw error;
  }
}
