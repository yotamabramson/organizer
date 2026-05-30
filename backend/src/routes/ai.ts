import type { FastifyInstance } from 'fastify';
import { state, saveConfig, updateEnvFile } from '../config.js';

export default async function aiConfigRoutes(server: FastifyInstance) {
  server.get('/api/ai/config', async (request, reply) => {
    return state.aiConfig;
  });

  server.post('/api/ai/config', async (request, reply) => {
    const { provider, geminiApiKey } = request.body as any;
    
    if (provider && ['local', 'gemini'].includes(provider)) {
      state.aiConfig.provider = provider;
      state.appConfig.ai.provider = provider;
      saveConfig(state.appConfig);
    }
    
    if (geminiApiKey !== undefined) {
      state.aiConfig.geminiApiKey = geminiApiKey;
      updateEnvFile({ geminiApiKey });
    }

    return { success: true, config: state.aiConfig };
  });
}