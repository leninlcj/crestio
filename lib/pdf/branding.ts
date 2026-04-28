// Shared brand tokens for server-side PDF rendering. Mirrors the design
// tokens in tailwind.config.ts but in raw RGB so pdf-lib can consume them.

import { rgb } from 'pdf-lib';

export const BRAND = {
  forest: rgb(31 / 255, 58 / 255, 46 / 255),
  forestSoft: rgb(232 / 255, 238 / 255, 232 / 255),
  forestInk: rgb(18 / 255, 36 / 255, 28 / 255),
  cream: rgb(250 / 255, 250 / 255, 248 / 255),
  ink: rgb(15 / 255, 23 / 255, 20 / 255),
  inkMuted: rgb(107 / 255, 111 / 255, 106 / 255),
  inkSoft: rgb(160 / 255, 163 / 255, 158 / 255),
  rule: rgb(234 / 255, 234 / 255, 230 / 255),
  ruleSoft: rgb(244 / 255, 244 / 255, 240 / 255),
  surface: rgb(1, 1, 1),
  claret: rgb(122 / 255, 34 / 255, 51 / 255),
  amber: rgb(184 / 255, 134 / 255, 11 / 255),
};

export type OrgBrand = {
  name: string;
  color: string | null;          // hex or null
  tutorName: string | null;
};

export function hexToRgb(hex: string | null) {
  if (!hex) return BRAND.forest;
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return BRAND.forest;
  const v = m[1];
  return rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
}
