// Hand-maintained Database types — keep in sync with supabase/migrations/*.
// (supabase gen types needs Docker or an access token; regenerate when available:
//  npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/lib/database.types.ts)

type UserWordRow = {
  id: string;
  user_id: string;
  lexicon_ref: string | null;
  target_language: string;
  source_language: string;
  lemma: string;
  translation: string;
  pos: string;
  gender: string | null;
  auxiliary: string | null;
  cefr: string | null;
  notes: string | null;
  flagged: boolean;
  status: string;
  forms: Record<string, string> | null;
  created_at: string;
};

type UserWordInsert = Omit<UserWordRow, 'id' | 'created_at' | 'flagged' | 'status' | 'forms'> &
  Partial<Pick<UserWordRow, 'id' | 'created_at' | 'flagged' | 'status' | 'forms'>>;

type LexiconEntryRow = {
  id: string;
  target_language: string;
  lemma: string;
  normalized: string;
  pos: string;
  gender: string | null;
  auxiliary: string | null;
  is_irregular: boolean;
  cefr: string | null;
  frequency_rank: number | null;
  source: string;
  created_at: string;
};

type LexiconTranslationRow = {
  id: string;
  entry_id: string;
  source_language: string;
  translation: string;
  sense_order: number;
  notes: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  learning_pair: { source: string; target: string };
  streak_count: number;
  gems: number;
  created_at: string;
};

type TagRow = {
  id: string;
  user_id: string | null;
  name: string;
  kind: string;
  color: string | null;
  icon: string | null;
};

type ConjugationRow = {
  id: string;
  user_word_id: string | null;
  lexicon_ref: string | null;
  tense: string;
  mood: string;
  person: string;
  form: string;
  is_compound: boolean;
  source: string;
};

type ExampleSentenceRow = {
  id: string;
  user_word_id: string | null;
  lexicon_ref: string | null;
  target_text: string;
  source_text: string;
  tense: string | null;
  source: string;
};

type SrsCardRow = {
  id: string;
  user_id: string;
  card_type: string;
  ref_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_reviewed: string | null;
  last_rating: number | null;
  wrong_count: number;
};

type SrsReviewRow = {
  id: string;
  card_id: string;
  rating: number;
  reviewed_at: string;
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      languages: Table<{ code: string; name_native: string; name_en: string; is_rtl: boolean }>;
      lexicon_entries: Table<LexiconEntryRow>;
      lexicon_translations: Table<LexiconTranslationRow>;
      profiles: Table<ProfileRow>;
      user_words: Table<UserWordRow, UserWordInsert>;
      tags: Table<TagRow>;
      user_word_tags: Table<{ user_word_id: string; tag_id: string }>;
      conjugations: Table<ConjugationRow>;
      example_sentences: Table<ExampleSentenceRow>;
      srs_cards: Table<SrsCardRow>;
      srs_reviews: Table<SrsReviewRow>;
    };
    Views: Record<string, never>;
    Functions: {
      search_lexicon_en: {
        Args: { q: string; target: string; max_results?: number };
        Returns: {
          id: string;
          lemma: string;
          pos: string;
          gender: string | null;
          auxiliary: string | null;
          cefr: string | null;
          translation: string | null;
        }[];
      };
      search_lexicon: {
        Args: { q: string; target: string; max_results?: number };
        Returns: {
          id: string;
          lemma: string;
          pos: string;
          gender: string | null;
          auxiliary: string | null;
          cefr: string | null;
          translation: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
