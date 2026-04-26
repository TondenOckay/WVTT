// src/Font.ts
import * as PIXI from 'pixi.js';

export interface GlyphInfo {
  u0: number; v0: number; u1: number; v1: number;
  width: number; height: number;
  advanceX: number;
  bearingX: number;
  bearingY: number;
}

export class BitmapFont {
  public fontId: string = '';
  public atlasWidth: number = 512;
  public atlasHeight: number = 512;
  public texture!: PIXI.Texture;      // PixiJS texture of the atlas
  public glyphs: Map<string, GlyphInfo> = new Map();
  public fontSize: number = 16;
  public lineHeight: number = 0;
  public ascent: number = 0;
  public descent: number = 0;
}

const loadedFonts = new Map<string, BitmapFont>();

export async function buildFont(
  fontId: string,
  fontPath: string,
  fontSize: number,
  glyphSpacing: number,
  rowPadding: number
): Promise<BitmapFont> {
  const font = new BitmapFont();
  font.fontId = fontId;
  font.fontSize = fontSize;

  // 1. Load the TTF file using the FontFace API
  const fontFace = new FontFace(fontId, `url(${fontPath})`);
  await fontFace.load();
  document.fonts.add(fontFace);

  // 2. Off-screen canvas for drawing
  const canvas = document.createElement('canvas');
  canvas.width = font.atlasWidth;
  canvas.height = font.atlasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontSize}px "${fontId}"`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 3. Character set (same as your C#)
  const chars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

  // 4. Measure ascent / descent from a tall character (e.g., 'M')
  const metrics = ctx.measureText('M');
  const tm = ctx.measureText('M');
  // ascent: distance from baseline to top of tallest character
  // descent: distance from baseline to bottom of lowest character
  // We'll approximate using the actualBoundingBoxAscent/Descent if available
  font.ascent = tm.actualBoundingBoxAscent ?? fontSize * 0.8;
  font.descent = tm.actualBoundingBoxDescent ?? fontSize * 0.2;
  font.lineHeight = font.ascent + font.descent + rowPadding;

  let x = 1;
  let y = Math.ceil(font.ascent);

  // 5. Draw each character and store glyph info
  for (const char of chars) {
    const m = ctx.measureText(char);
    const adv = m.width;
    const slotW = Math.ceil(adv) + glyphSpacing;
    if (x + slotW > font.atlasWidth) {
      x = 1;
      y += Math.ceil(font.lineHeight);
    }

    const ix = Math.floor(x);
    const iy = Math.floor(y);
    ctx.fillText(char, ix, iy);

    font.glyphs.set(char, {
      u0: ix / font.atlasWidth,
      v0: (iy - font.ascent) / font.atlasHeight,
      u1: (ix + Math.ceil(adv)) / font.atlasWidth,
      v1: (iy - font.ascent + font.lineHeight) / font.atlasHeight,
      width: Math.ceil(adv),
      height: font.lineHeight,
      advanceX: Math.ceil(adv) + glyphSpacing,
      bearingX: 0, // simplified
      bearingY: 0,
    });

    x += slotW;
  }

  // 6. Convert canvas to a PixiJS texture
  //    (use the canvas as a source for a Texture)
  font.texture = PIXI.Texture.from(canvas);
  loadedFonts.set(fontId, font);

  console.log(`[Font] Built atlas for "${fontId}" size=${fontSize} lineH=${font.lineHeight.toFixed(1)} chars=${font.glyphs.size}`);
  return font;
}

export function getFont(fontId: string): BitmapFont | undefined {
  return loadedFonts.get(fontId);
}
