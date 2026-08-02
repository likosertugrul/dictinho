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

const VOWEL_START = /^[aeiouàèéìíòóùú]/;
// Words taking lo/gli/uno: s+consonant, z, gn, ps, pn, x, y, i+vowel
// (lo studente, lo zio, lo gnocco, uno psicologo)
const LO_START = /^(s[bcdfghjklmnpqrstvwz]|z|gn|ps|pn|x|y|i[aeiou])/;

/**
 * Singular definite article for a noun: la/il/lo, l' before vowels.
 * Returns null when gender is unknown (custom words without enrichment).
 */
export function definiteArticle(lemma: string, gender: 'm' | 'f' | null): string | null {
  if (!gender) return null;
  const w = lemma.trim().toLowerCase();
  const startsWithVowel = VOWEL_START.test(w);
  if (gender === 'f') return startsWithVowel ? "l'" : 'la';
  if (startsWithVowel) return "l'";
  if (LO_START.test(w)) return 'lo';
  return 'il';
}

/** "casa" + f → "la casa"; "acqua" + f → "l'acqua"; unknown gender → lemma as-is. */
export function withArticle(lemma: string, gender: 'm' | 'f' | null): string {
  const article = definiteArticle(lemma, gender);
  if (!article) return lemma;
  return article === "l'" ? `l'${lemma}` : `${article} ${lemma}`;
}

/**
 * Plural definite article: feminine → "le"; masculine → "gli" before a vowel or
 * s+consonant/z/gn/ps/pn/x/y/i+vowel, otherwise "i".
 */
export function definiteArticlePlural(word: string, gender: 'm' | 'f' | null): string | null {
  if (!gender) return null;
  if (gender === 'f') return 'le';
  const w = word.trim().toLowerCase();
  if (VOWEL_START.test(w) || LO_START.test(w)) return 'gli';
  return 'i';
}

/** "case" + f → "le case"; "giorni" + m → "i giorni"; "studenti" + m → "gli studenti". */
export function withArticlePlural(pluralWord: string, gender: 'm' | 'f' | null): string {
  const article = definiteArticlePlural(pluralWord, gender);
  return article ? `${article} ${pluralWord}` : pluralWord;
}

/**
 * Singular indefinite article: un/uno (m), una/un' (f).
 * (un amico — masculine keeps "un" before vowels, unlike the definite article.)
 */
export function indefiniteArticle(word: string, gender: 'm' | 'f' | null): string | null {
  if (!gender) return null;
  const w = word.trim().toLowerCase();
  if (gender === 'f') return VOWEL_START.test(w) ? "un'" : 'una';
  return LO_START.test(w) ? 'uno' : 'un';
}

/** "casa" + f → "una casa"; "amica" + f → "un'amica"; "zio" + m → "uno zio". */
export function withIndefiniteArticle(word: string, gender: 'm' | 'f' | null): string {
  const article = indefiniteArticle(word, gender);
  if (!article) return word;
  return article === "un'" ? `un'${word}` : `${article} ${word}`;
}

/** Plural partitive ("some"): dei / degli / delle — mirrors i / gli / le. */
export function partitiveArticlePlural(word: string, gender: 'm' | 'f' | null): string | null {
  const article = definiteArticlePlural(word, gender);
  if (!article) return null;
  return article === 'le' ? 'delle' : article === 'gli' ? 'degli' : 'dei';
}

/** "case" + f → "delle case"; "studenti" + m → "degli studenti". */
export function withPartitivePlural(pluralWord: string, gender: 'm' | 'f' | null): string {
  const article = partitiveArticlePlural(pluralWord, gender);
  return article ? `${article} ${pluralWord}` : pluralWord;
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
