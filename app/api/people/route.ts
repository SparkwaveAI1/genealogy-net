import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Search people by name
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ people: [] });
    }

    const { data, error } = await supabase
      .from('people')
      .select('id, given_name, surname, birth_year, death_year, confidence')
      .or(`given_name.ilike.%${query}%,surname.ilike.%${query}%`)
      .order('surname', { ascending: true })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ people: data || [] });
  } catch (error: any) {
    console.error('Error searching people:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search people' },
      { status: 500 }
    );
  }
}

// POST - Create new person
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      given_name,
      surname,
      birth_year,
      birth_year_type,
      birthplace_detail,
      death_year,
      death_year_type,
      death_place_detail,
      confidence,
      ahnentafel,
      father_id,
      mother_id,
      bio,
    } = body;

    // Insert person
    const { data: person, error: personError } = await supabase
      .from('people')
      .insert([
        {
          given_name,
          surname,
          birth_year,
          birth_year_type: birth_year_type || 'exact',
          birthplace_detail,
          death_year,
          death_year_type: death_year_type || 'exact',
          death_place_detail,
          confidence: confidence || 'probable',
          ahnentafel,
          bio,
        },
      ])
      .select()
      .single();

    if (personError) throw personError;

    // Create family relationships if parents provided
    if (father_id && person) {
      await supabase.from('family_relationships').insert([
        {
          person_id: person.id,
          related_person_id: father_id,
          relationship_type: 'father',
        },
      ]);
    }

    if (mother_id && person) {
      await supabase.from('family_relationships').insert([
        {
          person_id: person.id,
          related_person_id: mother_id,
          relationship_type: 'mother',
        },
      ]);
    }

    return NextResponse.json({ success: true, person });
  } catch (error: any) {
    console.error('Error creating person:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create person' },
      { status: 500 }
    );
  }
}
