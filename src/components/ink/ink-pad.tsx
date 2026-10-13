import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InkCanvas, type InkTool } from '@/components/ink/ink-canvas';
import { eraseAt, type InkStroke } from '@/components/ink/strokes';
import { DEFAULT_PAPER, DEFAULT_RULE, paperColor, type Paper, type Rule } from '@/lib/paper';
import { colors, radius } from '@/theme/tokens';

/** Ink that stays legible on every paper (see colors.inks in tokens.ts). */
const INKS = [
  { label: 'Black ink', value: colors.inks.ink },
  { label: 'Coral ink', value: colors.inks.coral },
  { label: 'Blue ink', value: colors.inks.blue },
  { label: 'Green ink', value: colors.inks.green },
  { label: 'Plum ink', value: colors.inks.plum },
] as const;

/** Nib sizes in virtual units (see INK_W in strokes.ts). */
const NIBS = [
  { label: 'Fine', value: 4, dot: 5 },
  { label: 'Medium', value: 7, dot: 8 },
  { label: 'Broad', value: 11, dot: 11 },
] as const;

export const INK_DEFAULT_COLOR: string = INKS[0].value;
export const INK_DEFAULT_WIDTH: number = NIBS[1].value;

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-full ${
        active ? 'bg-primary' : 'bg-surface'
      } ${disabled ? 'opacity-40' : ''}`}>
      <Ionicons
        name={icon}
        size={18}
        color={active ? colors.onPrimary : disabled ? colors.textLo : colors.textHi}
      />
    </Pressable>
  );
}

interface ToolbarProps {
  tool: InkTool;
  onToolChange: (tool: InkTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
}

/**
 * Pens and nibs on the first row, corrections on the second. Two rows because
 * five inks plus three nibs plus three tools do not fit a phone's width in
 * one — and because the eraser deserves a labelled control rather than one
 * icon among nine.
 *
 * Lives apart from the canvas so the notebook can scale a full sheet to the
 * screen and still place this below it, outside the measured area.
 */
export function InkToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  canUndo,
  onUndo,
  onClear,
}: ToolbarProps) {
  return (
    <View className="gap-2 rounded-3xl bg-surfaceAlt p-2">
      <View className="flex-row flex-wrap items-center gap-1.5">
        {INKS.map((ink) => {
          const active = color === ink.value && tool === 'pen';
          return (
            <Pressable
              key={ink.value}
              accessibilityLabel={ink.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onColorChange(ink.value);
                onToolChange('pen');
              }}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: active ? colors.surface : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: colors.primary,
              }}>
              <View
                className="h-5 w-5 rounded-full"
                style={{ backgroundColor: ink.value, borderWidth: 1, borderColor: colors.border }}
              />
            </Pressable>
          );
        })}

        <View className="mx-0.5 h-6 w-px" style={{ backgroundColor: colors.border }} />

        {NIBS.map((nib) => {
          const active = width === nib.value;
          return (
            <Pressable
              key={nib.value}
              accessibilityLabel={`${nib.label} nib`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onWidthChange(nib.value)}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: active ? colors.surface : 'transparent' }}>
              <View
                style={{
                  width: nib.dot,
                  height: nib.dot,
                  borderRadius: nib.dot / 2,
                  backgroundColor: active ? colors.primary : colors.textLo,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between gap-1.5">
        <Pressable
          accessibilityLabel="Eraser"
          accessibilityRole="button"
          accessibilityState={{ selected: tool === 'eraser' }}
          onPress={() => onToolChange(tool === 'eraser' ? 'pen' : 'eraser')}
          className={`flex-row items-center gap-2 rounded-full px-4 py-2.5 ${
            tool === 'eraser' ? 'bg-primary' : 'bg-surface'
          }`}>
          <Ionicons
            name="backspace-outline"
            size={18}
            color={tool === 'eraser' ? colors.onPrimary : colors.textHi}
          />
          <Text
            className={`text-sm font-bold ${tool === 'eraser' ? 'text-white' : 'text-textHi'}`}>
            Eraser
          </Text>
        </Pressable>

        <View className="flex-row items-center gap-1.5">
          <ToolButton
            icon="arrow-undo-outline"
            label="Undo last stroke"
            disabled={!canUndo}
            onPress={onUndo}
          />
          <ToolButton
            icon="trash-outline"
            label="Clear the page"
            disabled={!canUndo}
            onPress={onClear}
          />
        </View>
      </View>
    </View>
  );
}

interface Props {
  strokes: InkStroke[];
  onChange: (strokes: InkStroke[]) => void;
  /** Pad height in virtual units; defaults to a full page. */
  vh?: number;
  /** Sheet colour and ruling. */
  paper?: Paper;
  rule?: Rule;
  /** Lets the parent freeze its ScrollView while the pen is down. */
  onDrawingChange?: (drawing: boolean) => void;
}

/**
 * The writing pad: a cream notebook page — the one light surface in a dark
 * app — with the toolbar kept quiet underneath it.
 */
export function InkPad({
  strokes,
  onChange,
  vh,
  paper = DEFAULT_PAPER,
  rule = DEFAULT_RULE,
  onDrawingChange,
}: Props) {
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState<string>(INK_DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(INK_DEFAULT_WIDTH);

  return (
    <View>
      <View
        className="overflow-hidden"
        style={{ borderRadius: radius.card, backgroundColor: paperColor(paper) }}>
        <InkCanvas
          strokes={strokes}
          vh={vh}
          rule={rule}
          edit={{
            tool,
            color,
            width,
            onAddStroke: (stroke) => onChange([...strokes, stroke]),
            onErase: (x, y, r) => {
              const left = eraseAt(strokes, x, y, r);
              if (left.length !== strokes.length) onChange(left);
            },
            onDrawingChange,
          }}
        />
      </View>

      <View className="mt-3">
        <InkToolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          width={width}
          onWidthChange={setWidth}
          canUndo={strokes.length > 0}
          onUndo={() => onChange(strokes.slice(0, -1))}
          onClear={() => onChange([])}
        />
      </View>

      {/*
        A fixed slot, not a conditional line: letting the hint come and go
        resized everything below the pad the moment the first stroke landed.
      */}
      <View style={{ height: 34 }} className="justify-center">
        {strokes.length === 0 && (
          <Text numberOfLines={2} className="text-center text-xs text-textLo">
            Write with your stylus — a finger works too. Hold the pen&apos;s side button to erase.
          </Text>
        )}
      </View>
    </View>
  );
}
