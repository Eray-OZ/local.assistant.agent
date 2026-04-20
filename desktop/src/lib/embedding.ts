import { pipeline, env } from '@xenova/transformers';

// Important: Avoid using the browser cache mechanism in node environment
env.allowLocalModels = true;
env.useBrowserCache = false;

class EmbeddingPipeline {
  static task: import('@xenova/transformers').PipelineType = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance: any = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model);
    }
    return this.instance;
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  const extractor = await EmbeddingPipeline.getInstance();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
