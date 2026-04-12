import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PATCH - Update person
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { data: person, error } = await supabase
      .from('people')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, person });
  } catch (error: any) {
    console.error('Error updating person:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update person' },
      { status: 500 }
    );
  }
}
