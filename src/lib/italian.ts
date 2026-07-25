// Canonical Italian grammar keys — DB, API JSON and UI all share these.
// (snake_case Italian names; see CLAUDE.md "Kurallar")

export const PERSONS = ['io', 'tu', 'lui_lei', 'noi', 'voi', 'loro'] as const;
export type Person = (typeof PERSONS)[number];

export const PERSON_LABELS: Record<Person, string> = {
  io: 'io',
  tu: 'tu',
  lui_lei: 'lui/lei',
  noi: 'noi',
  voi: 'voi',
  loro: 'loro',
};

export const TENSES = [
  'presente',
  'passato_prossimo',
  'imperfetto',
  'futuro_semplice',
  'condizionale_presente',
  'congiuntivo_presente',
] as const;
export type Tense = (typeof TENSES)[number];

export const TENSE_LABELS: Record<Tense, string> = {
  presente: 'Presente',
  passato_prossimo: 'Passato Prossimo',
  imperfetto: 'Imperfetto',
  futuro_semplice: 'Futuro Semplice',
  condizionale_presente: 'Condizionale Presente',
  congiuntivo_presente: 'Congiuntivo Presente',
};

/** Default tense selection offered in the add-word form (Faz 3). */
export const DEFAULT_TENSES: Tense[] = ['presente', 'passato_prossimo'];

export const POS_VALUES = ['verb', 'noun', 'adj', 'adv', 'prep', 'pron', 'conj', 'interj', 'phrase'] as const;
export type Pos = (typeof POS_VALUES)[number];

/** Display names for the word-class filter bar (English UI). */
export const POS_LABELS: Record<Pos, string> = {
  verb: 'Verbs',
  noun: 'Nouns',
  adj: 'Adjectives',
  adv: 'Adverbs',
  prep: 'Prepositions',
  pron: 'Pronouns',
  conj: 'Conjunctions',
  interj: 'Interjections',
  phrase: 'Phrases',
};

export const AUXILIARIES = ['essere', 'avere'] as const;
export type Auxiliary = (typeof AUXILIARIES)[number];

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

/**
 * Singular definite article for a noun: la/il/lo, l' before vowels.
 * Returns null when gender is unknown (custom words without enrichment).
 */
export function definiteArticle(lemma: string, gender: 'm' | 'f' | null): string | null {
  if (!gender) return null;
  const w = lemma.trim().toLowerCase();
  const startsWithVowel = /^[aeiouàèéìíòóùú]/.test(w);
  if (gender === 'f') return startsWithVowel ? "l'" : 'la';
  if (startsWithVowel) return "l'";
  // lo: s+consonant, z, gn, ps, pn, x, y, i+vowel (lo studente, lo zio, lo gnocco)
  if (/^(s[bcdfghjklmnpqrstvwz]|z|gn|ps|pn|x|y|i[aeiou])/.test(w)) return 'lo';
  return 'il';
}

/** "casa" + f → "la casa"; "acqua" + f → "l'acqua"; unknown gender → lemma as-is. */
export function withArticle(lemma: string, gender: 'm' | 'f' | null): string {
  const article = definiteArticle(lemma, gender);
  if (!article) return lemma;
  return article === "l'" ? `l'${lemma}` : `${article} ${lemma}`;
}

const ARTICLE_RE = /^(l'|un'|il|lo|la|i|gli|le|un|uno|una)\s+|^(l'|un')/;

/** lowercase, strip accents, drop a leading article, collapse spaces. */
function normalizeGuess(s: string): string {
  const base = s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
  return base.replace(ARTICLE_RE, '').trim();
}

/**
 * Lenient answer check for flashcards: accent- and case-insensitive, ignores a
 * leading article, so "citta", "città", and "la città" all match "città".
 */
export function matchesLemma(guess: string, lemma: string): boolean {
  const g = normalizeGuess(guess);
  return g.length > 0 && g === normalizeGuess(lemma);
}
