import { NextRequest, NextResponse } from 'next/server';
import { AIChatRouter } from '@/lib/ai-router';
import { AIMessage } from '@/lib/ai-models';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir, readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';

const WIKI_RAW = '/root/genealogy-wiki/raw';
const WIKI_SOURCES = '/root/genealogy-wiki/wiki/sources';
const WIKI_INDEX = '/root/genealogy-wiki/index.md';
const WIKI_LOG = '/root/genealogy-wiki/log.md';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oxpkqnmuwqcnmzvavsuz.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

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
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

type RateLimitEntry = {
  count: number;
  timestamps: number[];
};

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(req: NextRequest): string {
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
  const rateLimitKey = getRateLimitKey(req);
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 20 requests per hour.' },
      { status: 429 }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      return await handleFileChat(req);
    }

    const body = await req.json();
    return handleJsonChat(body);
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}

/**
 * File a document to the genealogy wiki.
 * Copies raw file, creates source page, updates index and log.
 */
async function fileToWiki(fileName: string, mimeType: string, buffer: Buffer): Promise<{ slug: string; rawPath: string; error?: string }> {
  const slug = `${new Date().toISOString().slice(0, 10)}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '-').substring(0, 60)}`;
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  const rawFileName = `${slug}.${ext}`;
  const rawPath = `${WIKI_RAW}/${rawFileName}`;
  const sourcePath = `${WIKI_SOURCES}/${slug}.md`;

  try {
    if (!existsSync(WIKI_RAW)) await mkdir(WIKI_RAW, { recursive: true });
    if (!existsSync(WIKI_SOURCES)) await mkdir(WIKI_SOURCES, { recursive: true });

    await writeFile(rawPath, buffer);
    console.log(`[Wiki] Copied raw file to ${rawPath}`);

    const docType = mimeType.startsWith('image/') ? 'photo'
      : mimeType === 'application/pdf' ? 'document'
      : mimeType.startsWith('text/') ? 'text'
      : 'other';

    const sourceContent = `---
title: "${fileName.replace(/"/g, '\\"')}"
type: ${docType}
date: "${new Date().toISOString().slice(0, 10)}"
key_people: []
gramps_ids: []
confidence: unverified
source_file: "${rawPath}"
intake_method: chat-paperclip
---

# ${fileName}

**Intake method:** Chat paperclip attachment
**MIME type:** ${mimeType}
**Original file:** ${fileName}

## Summary

*(Awaiting AI analysis — see chat thread for context)*

## Source Classification

- **Original/Derived/Authored:** Unverified
- **Primary/Secondary:** Unverified
- **Direct/Indirect evidence:** Unverified

## Raw File

\`${rawPath}\`
`;
    await writeFile(sourcePath, sourceContent);
    console.log(`[Wiki] Created source page at ${sourcePath}`);

    if (existsSync(WIKI_INDEX)) {
      const indexContent = await readFile(WIKI_INDEX, 'utf-8');
      const newEntry = `\n- **${fileName}** — ${docType} — chat paperclip (${new Date().toISOString().slice(0, 10)})`;
      await writeFile(WIKI_INDEX, indexContent.replace(/(## Sources\n)/, `$1${newEntry}`));
    }

    const logEntry = `\n## ${new Date().toISOString()} — Chat paperclip intake: ${fileName}\n- Raw: ${rawPath}\n- Source: ${sourcePath}\n`;
    await appendFile(WIKI_LOG, logEntry);

    return { slug, rawPath };
  } catch (err: any) {
    console.error('[Wiki] Filing error:', err.message);
    return { slug, rawPath, error: err.message };
  }
}

/**
 * Process an upload file for AI consumption.
 * Accepts optional pre-read buffer to avoid re-reading.
 */
async function processUploadFile(file: File, buffer?: Buffer): Promise<{ text?: string; base64?: string; mimeType?: string; error?: string }> {
  const buf = buffer || Buffer.from(await file.arrayBuffer());
  const mimeType = file.type;

  if (mimeType.startsWith('image/')) {
    return { base64: buf.toString('base64'), mimeType };
  }

  if (mimeType === 'application/pdf') {
    return new Promise((resolve) => {
      const chunks: string[] = [];
      const child = spawn('/usr/bin/pdftotext', ['-', '-']);
      child.stdout.on('data', (d) => chunks.push(d.toString()));
      child.stderr.on('data', (d) => console.error('pdftotext stderr:', d.toString()));
      child.on('close', (code) => {
        if (code === 0) {
          const text = chunks.join('').substring(0, 10000);
          resolve({ text: `[PDF extracted text]\n${text}` });
        } else {
          resolve({ error: `pdftotext exited with code ${code}` });
        }
      });
      child.on('error', (err) => resolve({ error: err.message }));
      child.stdin.write(buf);
      child.stdin.end();
    });
  }

  if (mimeType.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
    return { text: buf.toString('utf-8').substring(0, 10000) };
  }

  return { error: `Unsupported file type: ${mimeType}. Supported: images, PDFs, and text files.` };
}

async function handleFileChat(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const messagesJson = formData.get('messages') as string;
  const model = formData.get('model') as string | undefined;
  const deep = formData.get('deep') === 'true';
  const mode = formData.get('mode') as string | undefined;

  if (!file) {
    return NextResponse.json({ error: 'No file attached' }, { status: 400 });
  }
  if (!messagesJson) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  const messages: any[] = JSON.parse(messagesJson);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Process file for AI (text extraction)
  const processedFile = await processUploadFile(file, buffer);
  console.log('[Chat] processUploadFile result:', JSON.stringify(processedFile).substring(0, 200));

  if (processedFile.error) {
    return NextResponse.json({ error: processedFile.error }, { status: 400 });
  }

  // Attach processed file content to last user message for AI
  if (processedFile.base64 && processedFile.mimeType) {
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMsg) {
      lastUserMsg.imageBase64 = processedFile.base64;
      lastUserMsg.imageMimeType = processedFile.mimeType;
      console.log('[Chat] Attached image base64 to message, length:', processedFile.base64.length);
    }
  } else if (processedFile.text) {
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMsg) {
      const originalContent = lastUserMsg.content;
      lastUserMsg.content = `${lastUserMsg.content}\n\n--- BEGIN ATTACHED FILE (${file.name}) ---\n${processedFile.text}\n--- END ATTACHED FILE ---`;
      console.log('[Chat] Attached text to message. Original length:', originalContent.length, 'New length:', lastUserMsg.content.length);
      console.log('[Chat] Message preview:', lastUserMsg.content.substring(0, 300));
    }
  }

  // File to wiki and save to GRIP Supabase — fire and forget after AI response
  const wikiPromise = fileToWiki(file.name, file.type, buffer);
  const supabasePromise = (async () => {
    try {
      const sb = getServiceClient();
      await sb.from('documents').insert([{
        title: file.name,
        document_type: file.type.startsWith('image/') ? 'photo' : file.type === 'application/pdf' ? 'document' : 'text',
        description: '[Chat paperclip attachment]',
        document_date: new Date().toISOString(),
      }]);
    } catch (err: any) {
      console.error('[Supabase] Document save error:', err.message);
    }
  })();

  const result = await handleJsonChat({ messages, model, deep, mode });

  // Best-effort: await wiki/supabase after AI response
  wikiPromise.then(r => { if (!r.error) console.log(`[Chat] Wiki filed: ${r.rawPath}`); }).catch(() => {});
  supabasePromise.catch(() => {});

  return result;
}

async function handleJsonChat(body: any) {
  const { messages, deep, mode, mystery_context, location_context, model } = body;

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
  }

  let systemPrompt = GENEALOGY_SYSTEM_PROMPT;

  if (mode === 'briefing') {
    systemPrompt = `You are Hermes, the genealogy research AI assistant.

Compose a brief morning research briefing highlighting any important items that need attention and suggesting productive research tasks for today. Be concise and actionable.

` + GENEALOGY_SYSTEM_PROMPT;
  }

  if (mystery_context) {
    systemPrompt = `MYSTERY CONTEXT:\n${JSON.stringify(mystery_context, null, 2)}\n\n` + systemPrompt;
  }

  if (location_context) {
    systemPrompt = `LOCATION CONTEXT:\n${JSON.stringify(location_context, null, 2)}\n\n` + systemPrompt;
  }

  const aiMessages: AIMessage[] = messages.map((msg: any) => ({
    role: msg.role || 'user',
    content: msg.content || msg.text || '',
    imageBase64: msg.imageBase64,
    imageMimeType: msg.imageMimeType,
  }));

  const router = new AIChatRouter();
  const response = await router.chat(aiMessages, { deep, mode, model }, { system: systemPrompt });

  if (response.error) {
    return NextResponse.json({ error: response.error }, { status: 500 });
  }

  return NextResponse.json({
    message: response.message,
    provider: response.provider,
    full_response: response.raw,
  });
}
