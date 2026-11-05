import QRCode from "qrcode";

// QR codes for a business page. They encode the short link /q/<handle>
// (app/q/[handle]/route.ts) rather than the page itself: it's shorter, so the
// code has fewer, bigger squares that scan from further away, and printed
// posters keep working if the page's address ever moves.

/** The short link a QR code points to, e.g. "/q/acme". */
export function qrPath(handle: string) {
  return `/q/${handle}`;
}

// "M" recovers from ~15% damage: enough for a scuffed poster, without making the code denser.
const options = { errorCorrectionLevel: "M", margin: 2, color: { dark: "#1c1917", light: "#ffffff" } } as const;

/** The code as an SVG document, for printing at any size. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...options, type: "svg" });
}

/** The code as a PNG, `width` pixels square. */
export function qrPng(url: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...options, type: "png", width });
}
