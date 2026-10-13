// Paper for handwritten pages: the sheet's colour and its ruling.
//
// Modelled like `pos` and `topic` — plain text columns in the database whose
// allowed keys live here, shared by the DB, the editor and the thumbnails.
// Every paper is light on purpose: all five inks must stay legible on all of
// them, so there is no dark sheet to trap the user with invisible ink.

import type { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';

export const PAPER_VALUES = ['cream', 'white', 'mint', 'blush', 'sky'] as const;
export type Paper = (typeof PAPER_VALUES)[number];

export const PAPER_COLORS: Record<Paper, string> = {
  cream: colors.pastel.cream,
  white: colors.pastel.white,
  mint: colors.pastel.mint,
  blush: colors.pastel.blush,
  sky: colors.pastel.sky,
};

export const PAPER_LABELS: Record<Paper, string> = {
  cream: 'Cream',
  white: 'White',
  mint: 'Mint',
  blush: 'Blush',
  sky: 'Sky',
};

export const RULE_VALUES = ['lines', 'grid', 'dots', 'blank'] as const;
export type Rule = (typeof RULE_VALUES)[number];

export const RULE_LABELS: Record<Rule, string> = {
  lines: 'Ruled',
  grid: 'Grid',
  dots: 'Dotted',
  blank: 'Blank',
};

export const RULE_ICONS: Record<Rule, keyof typeof Ionicons.glyphMap> = {
  lines: 'reorder-four-outline',
  grid: 'grid-outline',
  dots: 'ellipsis-horizontal-outline',
  blank: 'square-outline',
};

export const DEFAULT_PAPER: Paper = 'cream';
export const DEFAULT_RULE: Rule = 'lines';

/** Read a stored value back, falling back instead of trusting the column. */
export function asPaper(value: string | null | undefined): Paper {
  return PAPER_VALUES.includes(value as Paper) ? (value as Paper) : DEFAULT_PAPER;
}

export function asRule(value: string | null | undefined): Rule {
  return RULE_VALUES.includes(value as Rule) ? (value as Rule) : DEFAULT_RULE;
}

export const paperColor = (paper: Paper): string => PAPER_COLORS[paper];
