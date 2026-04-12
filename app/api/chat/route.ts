import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const GENEALOGY_SYSTEM_PROMPT = `You are a genealogy research assistant specializing in the Johnson-Schoenberg-Sackerson family history.

When providing genealogical information:
- Always indicate your confidence level (High, Medium, Low) for each claim
- Cite sources when available (e.g., "According to the 1920 census..." or "Family Bible records indicate...")
- Distinguish between verified facts and family traditions/stories
- Note any conflicting information or uncertainties
- Suggest next steps for research when relevant
- Be particularly attentive to details about the Johnson, Schoenberg, and Sackerson family lines

Format your responses to be clear and well-organized, using confidence indicators like:
[High confidence] - Verified by primary sources
[Medium confidence] - Supported by secondary sources or circumstantial evidence
[Low confidence] - Based on family tradition or requires verification`;

// Rate limiting: 20 requests per hour
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

type RateLimitEntry = {
  count: number;
  timestamps: number[];
};

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(req: NextRequest): string {
  // Use IP address or fallback to a default key
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : req.headers.get('x-real-ip') || 'unknown';
  return ip;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry) {
    rateLimitMap.set(key, { count: 1, timestamps: [now] });
    return true;
  }

  // Remove timestamps older than the rate limit window
  entry.timestamps = entry.timestamps.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
  );

  if (entry.timestamps.length >= RATE_LIMIT) {
    return false;
  }

  entry.timestamps.push(now);
  entry.count = entry.timestamps.length;
  rateLimitMap.set(key, entry);

  return true;
}

export async function POST(req: NextRequest) {
  // Check rate limit
  const rateLimitKey = getRateLimitKey(req);
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 20 requests per hour.' },
      { status: 429 }
    );
  }
  try {
    const body = await req.json();
    const { messages, deep, mode, mystery_context, location_context } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Build system prompt
    let systemPrompt = GENEALOGY_SYSTEM_PROMPT;

    // Briefing mode: add database stats
    if (mode === 'briefing') {
      try {
        const { supabase } = await import('@/lib/supabase');

        const { count: peopleCount } = await supabase
          .from('people')
          .select('*', { count: 'exact', head: true });

        const { count: mysteriesCount } = await supabase
          .from('mysteries')
          .select('*', { count: 'exact', head: true });

        const { count: needsReviewCount } = await supabase
          .from('people')
          .select('*', { count: 'exact', head: true })
          .eq('needs_review', true);

        systemPrompt = `You are Hermes, the genealogy research AI assistant.

DATABASE STATS:
- People in database: ${peopleCount || 0}
- Active mysteries: ${mysteriesCount || 0}
- People needing review: ${needsReviewCount || 0}

Compose a brief morning research briefing highlighting any important items that need attention and suggesting productive research tasks for today. Be concise and actionable.

` + GENEALOGY_SYSTEM_PROMPT;
      } catch (error) {
        console.error('Error fetching briefing data:', error);
      }
    }

    // Add mystery context if provided
    if (mystery_context) {
      systemPrompt = `MYSTERY CONTEXT:
${JSON.stringify(mystery_context, null, 2)}

` + systemPrompt;
    }

    // Add location context if provided
    if (location_context) {
      systemPrompt = `LOCATION CONTEXT:
${JSON.stringify(location_context, null, 2)}

` + systemPrompt;
    }

    // Select model based on deep parameter
    const model = deep === true ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    // Extract text content from response
    const textContent = response.content.find(block => block.type === 'text');
    const message = textContent && 'text' in textContent ? textContent.text : '';

    return NextResponse.json({ message, full_response: response });
  } catch (error: any) {
    console.error('Anthropic API error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}
