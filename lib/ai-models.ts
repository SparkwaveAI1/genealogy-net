/**
 * Pluggable AI Model Abstraction for GRIP Chat
 * Supports: OpenAI (GPT-4o mini), Google (Gemini Flash), Groq (Llama 3.3 70B)
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Base64-encoded image to include with this message (all vision-capable models) */
  imageBase64?: string;
  imageMimeType?: string;
  /** Base64-encoded document (PDF) to include with this message (GPT-4o only) */
  documentBase64?: string;
  documentMimeType?: string;
}

export interface AIProvider {
  name: string;
  chat(messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse>;
}

export interface AIChatOptions {
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

export interface AIResponse {
  message: string;
  raw?: any;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

// ============================================
// OpenAI Provider (GPT-4o mini)
// ============================================
export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model;
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const systemMessage = options?.system
      ? { role: 'system' as const, content: options.system }
      : undefined;

    // Check if the last user message has an image attachment
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const hasImage = lastUserMsg?.imageBase64 && lastUserMsg?.imageMimeType;

    // Format messages, converting image or document attachment to content array format
    const formatMessage = (msg: AIMessage) => {
      const hasDocument = msg.role === 'user' && msg.documentBase64 && msg.documentMimeType;
      const hasImage = msg.role === 'user' && msg.imageBase64 && msg.imageMimeType;

      if (hasDocument) {
        const content: any[] = [];
        if (msg.content.trim()) content.push({ type: 'text', text: msg.content });
        content.push({
          type: 'document',
          document: {
            base64: msg.documentBase64,
            mime_type: msg.documentMimeType,
          },
        });
        return { role: msg.role, content };
      }

      if (hasImage) {
        const content: any[] = [];
        if (msg.content.trim()) content.push({ type: 'text', text: msg.content });
        content.push({
          type: 'image_url',
          image_url: { url: `data:${msg.imageMimeType};base64,${msg.imageBase64}` },
        });
        return { role: msg.role, content };
      }
      return { role: msg.role, content: msg.content };
    };

    const formattedMessages = messages.map(formatMessage);
    const allMessages = systemMessage
      ? [systemMessage, ...formattedMessages]
      : formattedMessages;

    const response = await client.chat.completions.create({
      model: this.model,
      messages: allMessages,
      max_tokens: options?.max_tokens ?? 1000,
      temperature: options?.temperature ?? 0.7,
    });

    const message = response.choices[0]?.message?.content || '';
    return {
      message,
      raw: response,
      usage: response.usage
        ? {
            input_tokens: response.usage.prompt_tokens,
            output_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

// ============================================
// Google Gemini Provider (Gemini Flash)
// ============================================
export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = 'gemini-2.0-flash') {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.model = model;
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(this.apiKey);
    const genModel = client.getGenerativeModel({ model: this.model });

    // Convert messages to Gemini format
    // Handle images as InlineData in parts array
    const contents = messages.map((msg) => {
      if (msg.role === 'user' && msg.imageBase64 && msg.imageMimeType) {
        const parts: any[] = [];
        if (msg.content.trim()) parts.push({ text: msg.content });
        parts.push({ inlineData: { mimeType: msg.imageMimeType, data: msg.imageBase64 } });
        return { role: 'user', parts };
      }
      return {
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
      };
    });

    const generationConfig = {
      maxOutputTokens: options?.max_tokens ?? 1000,
      temperature: options?.temperature ?? 0.7,
    };

    const result = await genModel.generateContent({
      contents,
      generationConfig,
      systemInstruction: options?.system ? { role: 'system', parts: [{ text: options.system }] } : undefined,
    });

    const response = await result.response;
    const message = response.text();
    return {
      message,
      raw: result,
    };
  }
}

// ============================================
// Groq Provider (Llama 3.3 70B)
// ============================================
export class GroqProvider implements AIProvider {
  name = 'groq';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = 'llama-3.3-70b-versatile') {
    this.apiKey = apiKey || process.env.GROQ_API_KEY || '';
    this.model = model;
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: options?.system
          ? [{ role: 'system', content: options.system }, ...messages]
          : messages,
        max_tokens: options?.max_tokens ?? 1000,
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${error}`);
    }

    const data = await response.json();
    const message = data.choices[0]?.message?.content || '';
    return {
      message,
      raw: data,
      usage: data.usage
        ? {
            input_tokens: data.usage.prompt_tokens,
            output_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}

// ============================================
// Provider Registry & Factory
// ============================================
export type AIProviderType = 'openai' | 'gemini' | 'groq';

export const PROVIDER_CLASSES: Record<AIProviderType, new (apiKey?: string) => AIProvider> = {
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  groq: GroqProvider,
};

export function createProvider(type: AIProviderType, apiKey?: string): AIProvider {
  const ProviderClass = PROVIDER_CLASSES[type];
  if (!ProviderClass) {
    throw new Error(`Unknown AI provider type: ${type}`);
  }
  return new ProviderClass(apiKey);
}

// Default provider based on environment or user preference
export function getDefaultProvider(): AIProvider {
  const preferred = process.env.AI_CHAT_PROVIDER as AIProviderType;
  if (preferred && PROVIDER_CLASSES[preferred]) {
    return createProvider(preferred);
  }
  // Fallback to OpenAI if available
  if (process.env.OPENAI_API_KEY) {
    return createProvider('openai');
  }
  // Fallback to Groq (free tier friendly)
  if (process.env.GROQ_API_KEY) {
    return createProvider('groq');
  }
  throw new Error('No AI provider credentials found in environment');
}
