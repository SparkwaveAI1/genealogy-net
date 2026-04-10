import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query string is required' },
        { status: 400 }
      );
    }

    // Use Gemini REST API directly with Google Search grounding
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: query,
              },
            ],
          },
        ],
        tools: [
          {
            googleSearchRetrieval: {},
          },
        ],
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Gemini API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();

    // Extract text from response
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // Extract grounding metadata (sources)
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sources =
      groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Unknown Source',
        uri: chunk.web?.uri || '',
      })) || [];

    return NextResponse.json({
      text,
      sources,
    });
  } catch (error: any) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}
