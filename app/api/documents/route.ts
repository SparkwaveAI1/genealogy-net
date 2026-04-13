import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const GENEALOGY_DOCUMENT_SYSTEM_PROMPT = `You are a genealogy document analyst following the Genealogical Proof Standard. Analyze this document and extract:
- All named individuals with dates and places
- Document type and date
- What this confirms or contradicts
- Confidence level of key claims
- Which mystery it might relate to
- What follow-up records to search

Flag any suspicious or unverified claims.

Return your analysis as a JSON object with these fields:
{
  "individuals_found": [{"name": "...", "dates": "...", "places": "...", "role": "..."}],
  "key_facts": ["fact 1", "fact 2", ...],
  "confidence_assessment": "overall confidence level and reasoning",
  "flags": ["flag 1", "flag 2", ...],
  "suggested_mystery_link": "which mystery this might relate to",
  "follow_up_records": ["record type 1", "record type 2", ...]
}`;

export async function POST(req: NextRequest) {
  try {
    console.log('Document upload started');

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const individual_context = formData.get('individual_context') as string;
    const document_type = formData.get('document_type') as string;
    const processing_instructions = formData.get('processing_instructions') as string;
    const mystery_id = formData.get('mystery_id') as string;

    console.log('File received:', file?.name, file?.type, file?.size);

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not set');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine file type
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf';
    const isText = file.type === 'text/plain' || file.name.endsWith('.txt');
    const isMarkdown = file.type === 'text/markdown' || file.name.endsWith('.md');
    const isWordDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                      file.type === 'application/msword' ||
                      file.name.endsWith('.docx') ||
                      file.name.endsWith('.doc');

    // Build user message prefix
    let userMessage = 'Please analyze this genealogy document.\n\n';
    if (individual_context) {
      userMessage += `Individual context: ${individual_context}\n`;
    }
    if (document_type) {
      userMessage += `Document type: ${document_type}\n`;
    }
    if (processing_instructions) {
      userMessage += `Instructions: ${processing_instructions}\n`;
    }

    // Build content array based on file type
    const content: any[] = [];

    if (isText || isMarkdown) {
      // Handle text-based files
      const textContent = buffer.toString('utf-8');
      userMessage += `\n\n--- FILE CONTENT (${file.name}) ---\n${textContent}\n--- END FILE CONTENT ---`;

      content.push({
        type: 'text',
        text: userMessage,
      });
    } else if (isPDF || isWordDoc) {
      // Handle PDF and Word documents as base64
      const base64 = buffer.toString('base64');
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      });
      content.push({
        type: 'text',
        text: userMessage,
      });
    } else if (isImage) {
      // Handle images
      const base64 = buffer.toString('base64');

      // Determine image media type
      let imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
      if (file.type === 'image/png') {
        imageMediaType = 'image/png';
      } else if (file.type === 'image/gif') {
        imageMediaType = 'image/gif';
      } else if (file.type === 'image/webp') {
        imageMediaType = 'image/webp';
      }

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: base64,
        },
      });
      content.push({
        type: 'text',
        text: userMessage,
      });
    } else {
      // Fallback: try to read as text
      try {
        const textContent = buffer.toString('utf-8');
        userMessage += `\n\n--- FILE CONTENT (${file.name}) ---\n${textContent}\n--- END FILE CONTENT ---`;

        content.push({
          type: 'text',
          text: userMessage,
        });
      } catch (error) {
        return NextResponse.json(
          { error: 'Unsupported file type. Please upload a PDF, image, text, markdown, or Word document.' },
          { status: 400 }
        );
      }
    }

    // Send to Claude API
    console.log('Sending to Claude API...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: GENEALOGY_DOCUMENT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    console.log('Claude API response received');

    // Extract text content from response
    const textContent = response.content.find(block => block.type === 'text');
    let analysisText = textContent && 'text' in textContent ? textContent.text : '';
    console.log('Analysis text length:', analysisText.length);

    // Try to parse JSON from the response
    let analysis;
    try {
      // Look for JSON in the response (might be wrapped in markdown code blocks)
      const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/) || analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        analysis = JSON.parse(jsonStr);
      } else {
        // If no JSON found, create a structured response from the text
        analysis = {
          individuals_found: [],
          key_facts: [analysisText],
          confidence_assessment: 'See analysis text',
          flags: [],
          suggested_mystery_link: '',
          follow_up_records: [],
        };
      }
    } catch (parseError) {
      // If parsing fails, wrap the text response
      analysis = {
        individuals_found: [],
        key_facts: [analysisText],
        confidence_assessment: 'See analysis text',
        flags: [],
        suggested_mystery_link: '',
        follow_up_records: [],
      };
    }

    // Save document record to Supabase
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert([
        {
          title: file.name,
          document_type: document_type || 'other',
          description: analysisText.substring(0, 500), // Store first 500 chars of analysis
          document_date: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('Error saving document to database:', dbError);
    }

    // If mystery_id provided, link the document to the mystery
    if (mystery_id && documentData) {
      // Note: You'd need a mystery_documents table for this
      // For now, just return the mystery_id in the response
    }

    // Search Gramps for each individual found in the document
    const peopleMatches: any[] = [];
    if (analysis.individuals_found && analysis.individuals_found.length > 0) {
      try {
        // Fetch all people from Gramps
        const grampsBaseUrl = process.env.GRAMPS_API_URL || 'http://178.156.250.119/api';

        // Get auth token
        const tokenResponse = await fetch(`${grampsBaseUrl}/token/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: process.env.GRAMPS_USERNAME,
            password: process.env.GRAMPS_PASSWORD,
          }),
        });
        const { access_token } = await tokenResponse.json();

        // Fetch people with limited fields for search
        const peopleResponse = await fetch(`${grampsBaseUrl}/people/?keys=gramps_id,handle,primary_name,birth_ref_index,death_ref_index,event_ref_list`, {
          headers: { 'Authorization': `Bearer ${access_token}` },
        });
        const allPeople = await peopleResponse.json();

        // For each individual found, search for matches
        for (const individual of analysis.individuals_found) {
          const name = individual.name.toLowerCase();
          const nameParts = name.split(' ').filter((p: string) => p.length > 0);

          // Simple matching: check if first and last name appear in person's name
          const matches = allPeople.filter((person: any) => {
            const firstName = person.primary_name.first_name?.toLowerCase() || '';
            const surname = person.primary_name.surname_list?.[0]?.surname?.toLowerCase() || '';
            const fullName = `${firstName} ${surname}`.toLowerCase();

            // Check if all name parts match
            return nameParts.every((part: string) => fullName.includes(part));
          }).slice(0, 5); // Limit to 5 matches per name

          if (matches.length > 0) {
            peopleMatches.push({
              extracted_name: individual.name,
              extracted_dates: individual.dates || null,
              extracted_places: individual.places || null,
              candidates: matches.map((p: any) => ({
                gramps_id: p.gramps_id,
                name: `${p.primary_name.first_name || ''} ${p.primary_name.surname_list?.[0]?.surname || ''}`.trim(),
                handle: p.handle,
              })),
            });
          }
        }
      } catch (searchError) {
        console.error('Error searching Gramps for people:', searchError);
        // Continue even if Gramps search fails
      }
    }

    console.log('Returning success response');
    return NextResponse.json({
      success: true,
      analysis,
      document_id: documentData?.id,
      mystery_id: mystery_id || null,
      raw_response: analysisText,
      people_matches: peopleMatches,
    });
  } catch (error: any) {
    console.error('Document processing error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An error occurred processing the document',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
