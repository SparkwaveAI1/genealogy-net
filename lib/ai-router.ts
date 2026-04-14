/**
 * AI Router - Model Selection & Request Routing
 * Routes chat requests to appropriate AI provider based on context
 */

import { NextRequest } from 'next/server';
import {
  AIProvider,
  AIProviderType,
  AIMessage,
  createProvider,
  getDefaultProvider,
} from './ai-models';

// ============================================
// Model Configuration
// ============================================
export type ModelTier = 'fast' | 'balanced' | 'deep';

interface ModelConfig {
  provider: AIProviderType;
  model?: string;
  description: string;
}

// Model mappings per provider
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Fast models (quick responses)
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', description: 'OpenAI GPT-4o mini - Fast & affordable' },
  'gemini-flash': { provider: 'gemini', model: 'gemini-2.0-flash', description: 'Google Gemini Flash - Fast & efficient' },
  'llama-fast': { provider: 'groq', model: 'llama-3.1-8b-instant', description: 'Groq Llama 8B - Ultra fast' },

  // Balanced models
  'gpt-4o': { provider: 'openai', model: 'gpt-4o', description: 'OpenAI GPT-4o - Balanced performance' },
  'gemini-pro': { provider: 'gemini', model: 'gemini-2.0-pro', description: 'Google Gemini Pro - Balanced' },
  'llama-balanced': { provider: 'groq', model: 'llama-3.3-70b-versatile', description: 'Groq Llama 3.3 70B - Versatile' },
};

// ============================================
// Router Configuration
// ============================================
export interface RouterConfig {
  defaultProvider?: AIProviderType;
  fallbackProviders?: AIProviderType[];
  enableModelRouting?: boolean;
}

const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  fallbackProviders: ['openai', 'gemini', 'groq'],
  enableModelRouting: true,
};

// ============================================
// Model Selection Logic
// ============================================
export interface SelectionContext {
  deep?: boolean;
  mode?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  fastResponse?: boolean;
  model?: string; // Explicit model selection
}

/**
 * Select appropriate model based on request context
 */
export function selectModel(context: SelectionContext): ModelConfig {
  const { deep, mode, fastResponse, model } = context;

  // Explicit model override - use the specified model if valid
  if (model && MODEL_CONFIGS[model]) {
    return MODEL_CONFIGS[model];
  }

  // Briefing mode - use fast model for quick database summaries
  if (mode === 'briefing') {
    return MODEL_CONFIGS['gemini-flash'] || MODEL_CONFIGS['llama-fast'];
  }

  // Deep research mode - use most capable model
  if (deep === true) {
    return MODEL_CONFIGS['llama-balanced'];
  }

  // Explicit fast response request
  if (fastResponse === true) {
    // Prefer Groq for speed
    if (process.env.GROQ_API_KEY) {
      return MODEL_CONFIGS['llama-fast'];
    }
    return MODEL_CONFIGS['gemini-flash'];
  }

  // Default: balanced model
  return MODEL_CONFIGS['llama-balanced'];
}

/**
 * Get provider instance for model config
 */
export function getProviderForModel(modelKey: string): AIProvider {
  const config = MODEL_CONFIGS[modelKey];
  if (!config) {
    return getDefaultProvider();
  }
  return createProvider(config.provider);
}

// ============================================
// Chat Router
// ============================================
export interface ChatRouterOptions {
  config?: RouterConfig;
  onError?: (error: Error, provider: AIProvider) => Promise<AIResponse>;
}

export interface AIResponse {
  message: string;
  raw?: any;
  provider?: string;
  error?: string;
}

export class AIChatRouter {
  private config: RouterConfig;
  private onError?: ChatRouterOptions['onError'];

  constructor(options?: ChatRouterOptions) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...options?.config };
    this.onError = options?.onError;
  }

  /**
   * Route and execute chat request with automatic fallback
   */
  async chat(
    messages: AIMessage[],
    context: SelectionContext,
    options?: { system?: string; max_tokens?: number; temperature?: number }
  ): Promise<AIResponse> {
    const modelConfig = selectModel(context);
    const provider = getProviderForModel(Object.keys(MODEL_CONFIGS).find(
      key => MODEL_CONFIGS[key].provider === modelConfig.provider
    ) || 'llama-balanced');

    try {
      const response = await provider.chat(messages, {
        system: options?.system,
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
      });

      return {
        ...response,
        provider: provider.name,
      };
    } catch (error) {
      console.error(`Primary provider ${provider.name} failed:`, error);

      // Try fallback providers
      if (this.config.fallbackProviders) {
        for (const fallbackType of this.config.fallbackProviders) {
          if (fallbackType === modelConfig.provider) continue;

          try {
            const fallbackProvider = createProvider(fallbackType);
            const response = await fallbackProvider.chat(messages, {
              system: options?.system,
              max_tokens: options?.max_tokens,
              temperature: options?.temperature,
            });

            return {
              ...response,
              provider: fallbackProvider.name,
            };
          } catch (fallbackError) {
            console.error(`Fallback provider ${fallbackType} failed:`, fallbackError);
            continue;
          }
        }
      }

      // All providers failed
      return {
        message: '',
        provider: provider.name,
        error: error instanceof Error ? error.message : 'All AI providers failed',
      };
    }
  }
}

// ============================================
// Convenience Functions
// ============================================
const defaultRouter = new AIChatRouter();

/**
 * Simple chat function using default router
 */
export async function routeChat(
  messages: AIMessage[],
  context: SelectionContext,
  options?: { system?: string; max_tokens?: number; temperature?: number }
): Promise<AIResponse> {
  return defaultRouter.chat(messages, context, options);
}

/**
 * Get available models for UI display
 */
export function getAvailableModels(): Array<{ key: string } & ModelConfig> {
  return Object.entries(MODEL_CONFIGS).map(([key, config]) => ({
    key,
    ...config,
  }));
}
