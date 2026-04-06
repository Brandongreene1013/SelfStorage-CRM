import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rpoiphoqwgvbiyygfjrm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_V3wdDHVDo9tpqU4Vb1WySA_iLDj6bvp';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
