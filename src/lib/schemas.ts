import { z } from 'zod';

import { AUXILIARIES, CEFR_LEVELS, PERSONS, POS_VALUES, TENSES } from '@/lib/italian';

export const posSchema = z.enum(POS_VALUES);
export const auxiliarySchema = z.enum(AUXILIARIES);
export const cefrSchema = z.enum(CEFR_LEVELS);
export const tenseSchema = z.enum(TENSES);
export const personSchema = z.enum(PERSONS);

/** Row returned by the `search_lexicon` RPC (autocomplete). */
export const lexiconSuggestionSchema = z.object({
  id: z.uuid(),
  lemma: z.string(),
  pos: posSchema,
  gender: z.enum(['m', 'f']).nullable(),
  auxiliary: auxiliarySchema.nullable(),
  cefr: cefrSchema.nullable(),
  translation: z.string().nullable(),
});
export type LexiconSuggestion = z.infer<typeof lexiconSuggestionSchema>;

/**
 * `enrich-word` response: the entry the user asked for, plus the same lemma in
 * other word classes ("bleach" the verb → "bleach" the noun) and, for idioms,
 * the word-for-word gloss behind the idiomatic meaning.
 */
export const enrichResultSchema = lexiconSuggestionSchema.extend({
  literal: z.string().nullable().default(null),
  alternatives: z.array(lexiconSuggestionSchema).default([]),
});
export type EnrichResult = z.infer<typeof enrichResultSchema>;

/** `enrich-word` Edge Function response (Faz 2). */
export const enrichmentSchema = z.object({
  lemma: z.string(),
  pos: posSchema,
  auxiliary: auxiliarySchema.nullable(),
  gender: z.enum(['m', 'f']).nullable(),
  is_irregular: z.boolean(),
  cefr: cefrSchema.nullable(),
  translations: z.array(z.string()).min(1),
  suggested_tenses: z.array(tenseSchema),
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

/** One tense block from `generate-conjugations` (Faz 3). */
export const tenseFormsSchema = z
  .object({
    compound: z.boolean().optional(),
    aux: auxiliarySchema.optional(),
  })
  .catchall(z.string()); // io/tu/lui_lei/noi/voi/loro → form

export const conjugationsResponseSchema = z.object({
  lemma: z.string(),
  auxiliary: auxiliarySchema.nullable(),
  tenses: z.record(tenseSchema, tenseFormsSchema),
});
export type ConjugationsResponse = z.infer<typeof conjugationsResponseSchema>;

/** `generate-sentences` Edge Function response (Faz 4). */
export const exampleSentenceSchema = z.object({
  target_text: z.string(),
  source_text: z.string(),
  tense: tenseSchema.nullable(),
});
export type ExampleSentence = z.infer<typeof exampleSentenceSchema>;

/** user_words row (personal vocabulary). */
export const userWordSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  lexicon_ref: z.uuid().nullable(),
  target_language: z.string(),
  source_language: z.string(),
  lemma: z.string(),
  translation: z.string(),
  pos: posSchema,
  gender: z.enum(['m', 'f']).nullable(),
  auxiliary: auxiliarySchema.nullable(),
  cefr: cefrSchema.nullable(),
  notes: z.string().nullable(),
  flagged: z.boolean().default(false),
  status: z.enum(['learning', 'known']).default('learning'),
  // AI-corrected inflected forms (override for the rule-based inflection).
  // Nouns: {singular, plural}. Adjectives: {m_sg, f_sg, m_pl, f_pl}.
  forms: z.record(z.string(), z.string()).nullable().default(null),
  created_at: z.string(),
});
export type UserWord = z.infer<typeof userWordSchema>;
export type WordStatus = UserWord['status'];
