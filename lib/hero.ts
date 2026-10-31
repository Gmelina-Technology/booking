// How an owner's page banner looks. Edited at /app/banner, rendered by
// app/p/[handle]/hero-view.tsx. Pure data and helpers: safe in client components.

export type HeroTemplate = "collage" | "spotlight" | "split" | "minimal";
export type HeroAlignX = "left" | "center" | "right";
export type HeroAlignY = "top" | "center" | "bottom";
export type ButtonShape = "square" | "rounded" | "pill";
export type ButtonVariant = "solid" | "outline" | "soft";
export type ButtonSize = "md" | "lg";

export type HeroButton = {
  label: string;
  /** "featured" (first activity), "activities" (the list below the banner) or an activity slug. */
  target: string;
};

export type HeroSettings = {
  template: HeroTemplate;
  /** Empty strings fall back to the built-in wording. */
  eyebrow: string;
  headline: string;
  subheadline: string;
  showEyebrow: boolean;
  /** Where the text block sits. Which values apply depends on the template (see templates[].positions). */
  alignX: HeroAlignX;
  alignY: HeroAlignY;
  /** Banner background and the colour of highlights and the main button, as #rrggbb. */
  background: string;
  accent: string;
  /** How dark the tint over photos is, 0–90 (%). */
  overlay: number;
  /** Which part of each photo stays in view when it's cropped. */
  imageFocus: HeroAlignY;
  /** Upload names from the owner's banner library, in display order. Empty uses event and stock photos. */
  images: string[];
  primary: HeroButton;
  secondary: HeroButton & { show: boolean };
  buttonShape: ButtonShape;
  buttonVariant: ButtonVariant;
  buttonSize: ButtonSize;
};

/** What's stored per owner: the settings plus every banner photo they've uploaded. */
export type HeroDoc = { settings: HeroSettings; library: string[] };

export const MAX_HERO_IMAGES = 4;
export const MAX_LIBRARY_IMAGES = 12;

export const templates: {
  id: HeroTemplate;
  name: string;
  description: string;
  /** Text positions that make sense for this layout. */
  positions: { x: HeroAlignX[]; y: HeroAlignY[] };
  /** How many photos the layout shows. */
  photos: number;
}[] = [
  {
    id: "collage",
    name: "Collage",
    description: "Headline beside a staggered grid of up to four photos.",
    positions: { x: ["left", "center", "right"], y: ["center"] },
    photos: 4,
  },
  {
    id: "spotlight",
    name: "Spotlight",
    description: "One full-width photo with the text laid over it.",
    positions: { x: ["left", "center", "right"], y: ["top", "center", "bottom"] },
    photos: 1,
  },
  {
    id: "split",
    name: "Split",
    description: "Solid colour panel on one side, a big photo on the other.",
    positions: { x: ["left", "right"], y: ["top", "center", "bottom"] },
    photos: 1,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "No photos. Bold type on your brand colour with quick facts.",
    positions: { x: ["left", "center"], y: ["center"] },
    photos: 0,
  },
];

export const backgroundSwatches = ["#022c22", "#0f172a", "#1e1b4b", "#3b0764", "#450a0a", "#1c1917", "#f5f5f4", "#ecfccb"];
export const accentSwatches = ["#bef264", "#facc15", "#fb923c", "#f472b6", "#38bdf8", "#34d399", "#ffffff", "#047857"];

export const defaultHeroSettings: HeroSettings = {
  template: "collage",
  eyebrow: "",
  headline: "",
  subheadline: "",
  showEyebrow: true,
  alignX: "left",
  alignY: "center",
  background: "#022c22",
  accent: "#bef264",
  overlay: 60,
  imageFocus: "center",
  images: [],
  primary: { label: "", target: "featured" },
  secondary: { label: "See all activities", target: "activities", show: true },
  buttonShape: "rounded",
  buttonVariant: "solid",
  buttonSize: "lg",
};

export const defaultHeroDoc = (): HeroDoc => ({ settings: structuredClone(defaultHeroSettings), library: [] });

const HEX = /^#[0-9a-f]{6}$/;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && HEX.test(value.toLowerCase()) ? value.toLowerCase() : fallback;
const target = (value: unknown) => (typeof value === "string" && /^[a-z0-9-]{1,60}$/.test(value) ? value : "featured");

/**
 * Turns untrusted input (a form post or an old stored document) into valid
 * settings. Unknown or missing fields get their defaults; images are limited
 * to `library`, so an owner can only show photos they uploaded themselves.
 */
export function normalizeHeroSettings(input: unknown, library: string[]): HeroSettings {
  const d = defaultHeroSettings;
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const primary = (s.primary && typeof s.primary === "object" ? s.primary : {}) as Record<string, unknown>;
  const secondary = (s.secondary && typeof s.secondary === "object" ? s.secondary : {}) as Record<string, unknown>;
  const template = oneOf(s.template, templates.map((t) => t.id), d.template);
  const { positions } = templates.find((t) => t.id === template)!;
  const overlay = Number(s.overlay);
  const images = Array.isArray(s.images) ? s.images.filter((n): n is string => library.includes(n as string)) : [];

  return {
    template,
    eyebrow: text(s.eyebrow, 60),
    headline: text(s.headline, 100),
    subheadline: text(s.subheadline, 240),
    showEyebrow: s.showEyebrow !== false,
    alignX: oneOf(s.alignX, positions.x, positions.x[0]),
    alignY: oneOf(s.alignY, positions.y, positions.y.includes("center") ? "center" : positions.y[0]),
    background: color(s.background, d.background),
    accent: color(s.accent, d.accent),
    overlay: Number.isFinite(overlay) ? Math.round(Math.min(90, Math.max(0, overlay))) : d.overlay,
    imageFocus: oneOf(s.imageFocus, ["top", "center", "bottom"] as const, d.imageFocus),
    images: [...new Set(images)].slice(0, MAX_HERO_IMAGES),
    primary: { label: text(primary.label, 40), target: target(primary.target) },
    secondary: {
      label: text(secondary.label, 40),
      target: secondary.target === undefined ? "activities" : target(secondary.target),
      show: secondary.show !== false,
    },
    buttonShape: oneOf(s.buttonShape, ["square", "rounded", "pill"] as const, d.buttonShape),
    buttonVariant: oneOf(s.buttonVariant, ["solid", "outline", "soft"] as const, d.buttonVariant),
    buttonSize: oneOf(s.buttonSize, ["md", "lg"] as const, d.buttonSize),
  };
}

/** Whether dark text reads better than white on `hex` (WCAG relative luminance). */
export function isLight(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179;
}

/** `hex` with an alpha channel, for tints and overlays. */
export function withAlpha(hex: string, alpha: number) {
  return `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0")}`;
}
