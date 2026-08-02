import { Text, View } from 'react-native';

import { Speaker } from '@/components/speaker';
import { nounForms } from '@/lib/inflect';
import {
  withArticle,
  withArticlePlural,
  withIndefiniteArticle,
  withPartitivePlural,
} from '@/lib/italian';
import { hasGrammar } from '@/lib/lang';
import type { UserWord } from '@/lib/schemas';

/**
 * Every article a noun takes: definite + indefinite singular, definite +
 * partitive plural. Shown on the word card and after a flashcard is answered.
 * Renders nothing for non-nouns, unknown gender or languages without articles.
 */
export function ArticleInfo({
  word,
  title = 'Articles',
  tone = 'surface',
  className = '',
}: {
  word: UserWord;
  title?: string | null;
  tone?: 'surface' | 'surfaceAlt';
  className?: string;
}) {
  if (!hasGrammar(word.target_language) || word.pos !== 'noun' || !word.gender) return null;

  // AI-corrected forms win over rule-based inflection (irregular plurals).
  const rule = nounForms(word.lemma, word.gender);
  const singular = word.forms?.singular ?? rule.singular;
  const plural = word.forms?.plural ?? rule.plural;

  const rows: { label: string; value: string }[] = [
    { label: 'the (sing.)', value: withArticle(singular, word.gender) },
    { label: 'a / an', value: withIndefiniteArticle(singular, word.gender) },
    { label: 'the (plur.)', value: withArticlePlural(plural, word.gender) },
    { label: 'some', value: withPartitivePlural(plural, word.gender) },
  ];

  return (
    <View className={`w-full ${className}`}>
      {title ? (
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm font-bold text-textHi">{title}</Text>
          <Text className="text-xs font-semibold text-textLo">
            {word.gender === 'f' ? 'feminine' : 'masculine'}
          </Text>
        </View>
      ) : null}
      <View
        className={`overflow-hidden rounded-2xl ${tone === 'surfaceAlt' ? 'bg-surfaceAlt' : 'bg-surface'}`}>
        {rows.map((row, i) => (
          <View
            key={row.label}
            className={`flex-row items-center justify-between px-4 py-2.5 ${
              i > 0 ? 'border-t border-border' : ''
            }`}>
            <Text className="text-xs font-semibold uppercase tracking-wide text-textLo">
              {row.label}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-base font-semibold text-textHi">{row.value}</Text>
              <Speaker text={row.value} lang={word.target_language} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
