import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy without nonces: nonces need every page rendered per
// request, which rules out the Partial Prerendering this app uses. Inline
// scripts are still allowed (Next's own bootstrap needs them), but scripts,
// frames, forms and connections from other sites are blocked. React needs
// 'unsafe-eval' in development only. See the Next.js content-security-policy guide.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Uploads are served from /uploads; stock banner photos come from Unsplash.
  "img-src 'self' blob: data: https://images.unsplash.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Browsers only honour this over HTTPS, so it's harmless in local development.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Older browsers that don't read frame-ancestors: never show staff pages in a frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Booking and reset links hold secret tokens: send other sites the origin only.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
