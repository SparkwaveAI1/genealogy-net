import { NextRequest, NextResponse } from 'next/server';
import { AIChatRouter } from '@/lib/ai-router';
import { AIMessage } from '@/lib/ai-models';
import { supabaseService } from '@/lib/supabase-service';
import path from 'path';

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
[Low confidence] - Based on family tradition or requires verification

DOCUMENT PROCESSING: When analyzing uploaded documents (PDFs, images, etc.), after your analysis, ALWAYS propose specific actions the user can take to save this information to their family tree. End your response with a section like:

---ACTIONS---
1. [Add to Michael Looney profile] → add_evidence|person_id=I402161207379|description=Served in Capt. John Shelby's Virginia militia company, Revolutionary War era.|source=DOCUMENT_NAME|evidence_type=primary|confidence=high
2. [Add to Benjamin Looney profile] → add_evidence|person_id=I13617490834|description=Benjamin Looney mentioned on page 1 of document, may be son of Robert Looney Jr.|source=DOCUMENT_NAME|evidence_type=secondary|confidence=medium
3. [Create John Shelby] → create_person|given_name=John|surname=Shelby|birth_year=1723|notes=Married Louisa Looney, dau. of Robert Looney Sr. Captain in Col. Evan Shelby's Virginia Regiment. Died 1794, Washington County, VA.

Use Gramps IDs you know. For create_person, include everything known in the notes field. Keep action labels short (under 50 chars).`;

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
  rateLimitMap.set(key, { count: entry.count, timestamps: entry.timestamps });

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

// ──────────────────────────────────────────────────────────────────────────
// Upload file → Supabase Storage + documents table
// ──────────────────────────────────────────────────────────────────────────

async function saveUploadToSupabase(file: File, buffer: Buffer): Promise<{ documentId: string; filePath: string }> {
  const ext = path.extname(file.name).toLowerCase() || '.' + file.name.split('.').pop();
  const slug = `${new Date().toISOString().slice(0, 10)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-').substring(0, 50)}`;
  const storagePath = `raw/${new Date().toISOString().slice(0, 7)}/${slug}${ext}`;

  const { error: uploadError } = await supabaseService.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabaseService.storage.from('documents').getPublicUrl(storagePath);

  const docType = file.type.startsWith('image/') ? 'photo'
    : file.type === 'application/pdf' ? 'document'
    : file.type.startsWith('text/') ? 'text'
    : 'other';

  const { data: docData, error: docError } = await supabaseService
    .from('documents')
    .insert([
      {
        title: file.name,
        document_type: docType,
        description: '[Chat paperclip attachment]',
        date: new Date().toISOString(),
        file_path: storagePath,
        url: urlData?.publicUrl || null,
      },
    ])
    .select('id')
    .single();

  if (docError || !docData) {
    throw new Error(`Document record creation failed: ${docError?.message || 'no id returned'}`);
  }

  return { documentId: docData.id, filePath: storagePath };
}

// ──────────────────────────────────────────────────────────────────────────
// Text extraction from buffer
// ──────────────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.heic']);
const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.rt', '.ged', '.gedcom']);

async function extractText(buffer: Buffer, ext: string, mimeType: string, fileName: string): Promise<string> {
  if (IMAGE_EXTS.has(ext)) {
    return `[IMAGE FILE]`;
  }

  if (ext === '.pdf') {
    try {
      const fs = require('fs');
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const tmpPath = `/tmp/doc-${Date.now()}.pdf`;
      fs.writeFileSync(tmpPath, buffer);
      const { stdout } = await execAsync(`pdftotext -layout "${tmpPath}" - 2>/dev/null`, { timeout: 30000 });
      fs.unlinkSync(tmpPath);
      if (stdout.trim()) return stdout.trim();
    } catch {
      // pdftotext failed
    }
    return `[PDF FILE (scanned or pdftotext failed)]`;
  }

  if (TEXT_EXTS.has(ext) || mimeType.startsWith('text/')) {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      return `[DOCX extraction failed]`;
    }
  }

  return `[UNSUPPORTED FILE TYPE: ${mimeType}]`;
}

// ──────────────────────────────────────────────────────────────────────────
// Look up recent documents from Supabase and include content in context
// ──────────────────────────────────────────────────────────────────────────

async function attachRecentDocuments(messages: any[], supabase: typeof supabaseService): Promise<any[]> {
  // Find the last user message content
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
  if (!lastUserMsg) return messages;

  const userText = (lastUserMsg.content || '').toLowerCase();

  // Check if user is asking about a document (keywords)
  const docKeywords = ['document', 'file', 'upload', 'paper', 'record', 'that', 'this', 'it'];
  const isAskingAboutDoc = docKeywords.some(k => userText.includes(k));

  if (!isAskingAboutDoc) return messages;

  // Fetch recent documents
  const { data: recentDocs, error } = await supabase
    .from('documents')
    .select('id, title, file_path, document_type, date')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !recentDocs || recentDocs.length === 0) return messages;

  // Try to find the most relevant document
  let targetDoc = recentDocs[0]; // default to most recent

  // Try to match by filename in user message
  for (const doc of recentDocs) {
    const docName = doc.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (userText.includes(docName.substring(0, 10))) {
      targetDoc = doc;
      break;
    }
  }

  if (!targetDoc?.file_path) return messages;

  // Download from Supabase Storage
  const { data: buffer, error: downloadError } = await supabase.storage
    .from('documents')
    .download(targetDoc.file_path);

  if (downloadError || !buffer) {
    console.error('[Chat] Document download error:', downloadError?.message);
    return messages;
  }

  const buf = Buffer.from(await buffer.arrayBuffer());
  const ext = path.extname(targetDoc.file_path).toLowerCase();
  const content = await extractText(buf, ext, buffer.type || '', targetDoc.title);

  // Attach document content to the last user message
  const enrichedMsg = {
    ...lastUserMsg,
    content: `${lastUserMsg.content}

--- DOCUMENT CONTEXT ---
The user is referring to: "${targetDoc.title}"
Document date: ${targetDoc.date || 'unknown'}
Document type: ${targetDoc.document_type}

Document content:
${content}
--- END DOCUMENT CONTEXT ---`,
  };

  // Replace the message in the array
  const result = [...messages];
  const msgIndex = result.findIndex((m, i) => i === messages.length - 1 && m.role === 'user');
  if (msgIndex !== -1) {
    result[msgIndex] = enrichedMsg;
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Handle paperclip file upload in chat
// ──────────────────────────────────────────────────────────────────────────

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
  const buffer = Buffer.from(await file.arrayBuffer());

  // Save to Supabase Storage + documents table
  let savedDocId: string | null = null;
  try {
    const { documentId } = await saveUploadToSupabase(file, buffer);
    savedDocId = documentId;
    console.log('[Chat] Document saved to Supabase:', documentId);
  } catch (err: any) {
    console.error('[Chat] Document save failed:', err.message);
    // Continue anyway — the AI can still analyze the file content directly
  }

  // Extract text from the buffer
  const ext = path.extname(file.name).toLowerCase();
  const extractedText = await extractText(buffer, ext, file.type, file.name);

  // Attach file content to last user message
  const lastUserMsgIndex = [...messages].reverse().findIndex((m: any) => m.role === 'user');
  const actualIndex = lastUserMsgIndex >= 0 ? messages.length - 1 - lastUserMsgIndex : -1;

  if (actualIndex !== -1) {
    const docContext = savedDocId
      ? `\n\n[Attached document saved as ID: ${savedDocId}]`
      : '';

    const textContext = extractedText.startsWith('[UNSUPPORTED') || extractedText.startsWith('[PDF FILE')
      ? `\n\n${extractedText}${docContext}`
      : `\n\n--- BEGIN ATTACHED FILE (${file.name}) ---\n${extractedText}\n--- END ATTACHED FILE ---${docContext}`;

    messages[actualIndex] = {
      ...messages[actualIndex],
      content: messages[actualIndex].content + textContext,
    };
  }

  const result = await handleJsonChat({ messages, model, deep, mode });
  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Handle regular JSON chat with optional document context
// ──────────────────────────────────────────────────────────────────────────

async function handleJsonChat(body: any) {
  const { messages, deep, mode, mystery_context, location_context, model } = body;

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
  }

  // Look up relevant documents from Supabase and attach content
  const messagesWithDocs = await attachRecentDocuments(messages, supabaseService);

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

  const aiMessages: AIMessage[] = messagesWithDocs.map((msg: any) => ({
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
