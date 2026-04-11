import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://oxpkqnmuwqcnmzvavsuz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94cGtxbm11d3Fjbm16dmF2c3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTQxMjksImV4cCI6MjA4NDE3MDEyOX0.Skd3A9eyGtwGzQeEdSGM9wZX5eUzHdfww1N8bliwkTY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
