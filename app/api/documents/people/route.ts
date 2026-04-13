import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { document_id, gramps_ids } = await req.json();

    if (!document_id || !gramps_ids || !Array.isArray(gramps_ids)) {
      return NextResponse.json(
        { error: 'Missing document_id or gramps_ids array' },
        { status: 400 }
      );
    }

    // Create document_people records for each gramps_id
    const records = gramps_ids.map(gramps_id => ({
      document_id,
      person_id: gramps_id, // Using gramps_id as person_id
    }));

    const { data, error } = await supabase
      .from('document_people')
      .insert(records)
      .select();

    if (error) {
      console.error('Error inserting document_people records:', error);
      return NextResponse.json(
        { error: 'Failed to save document-person links', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: data.length,
      records: data,
    });
  } catch (error: any) {
    console.error('Error in documents/people POST:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
