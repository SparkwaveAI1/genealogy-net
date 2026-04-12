import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST - Create family relationship
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { person_id, related_person_id, relationship_type } = body;

    if (!person_id || !related_person_id || !relationship_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create the relationship
    const { data, error } = await supabase
      .from('family_relationships')
      .insert([
        {
          person_id,
          related_person_id,
          relationship_type,
        },
      ])
      .select();

    if (error) throw error;

    // For bidirectional relationships (spouse, sibling), create reverse
    if (relationship_type === 'spouse' || relationship_type === 'sibling') {
      await supabase.from('family_relationships').insert([
        {
          person_id: related_person_id,
          related_person_id: person_id,
          relationship_type,
        },
      ]);
    }

    // For parent/child, create reverse relationship
    if (relationship_type === 'father' || relationship_type === 'mother') {
      await supabase.from('family_relationships').insert([
        {
          person_id: related_person_id,
          related_person_id: person_id,
          relationship_type: 'child',
        },
      ]);
    }

    if (relationship_type === 'child') {
      // Determine if this is a father or mother relationship
      // This would require gender info or explicit specification
      // For now, we'll skip creating the reverse
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error creating relationship:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create relationship' },
      { status: 500 }
    );
  }
}
