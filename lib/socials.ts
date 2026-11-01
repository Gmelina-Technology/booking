// Social media accounts a business links from its page. Owners type a link or
// just their handle at /app/business; normalizeSocial() turns either into a
// full https link on that network, so the page only ever links to these sites.

export const socialNetworks = [
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"], profile: (h: string) => `https://www.facebook.com/${h}` },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], profile: (h: string) => `https://www.instagram.com/${h}` },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"], profile: (h: string) => `https://www.tiktok.com/@${h}` },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], profile: (h: string) => `https://www.youtube.com/@${h}` },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"], profile: (h: string) => `https://x.com/${h}` },
] as const;

export type SocialNetwork = (typeof socialNetworks)[number]["key"];

/** Full https links, keyed by network. A missing or empty value hides that network. */
export type SocialLinks = Partial<Record<SocialNetwork, string>>;

const HANDLE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * A link or handle typed by the owner → a full link on that network, "" for
 * blank input, or null when it isn't a valid account on that network.
 */
export function normalizeSocial(network: SocialNetwork, input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  const net = socialNetworks.find((n) => n.key === network)!;

  // No slash: a handle (which may contain dots, e.g. "my.courts").
  if (!value.includes("/")) {
    const handle = value.replace(/^@/, "");
    return HANDLE.test(handle) && !net.hosts.includes(handle.toLowerCase().replace(/^www\./, "") as never) ? net.profile(handle) : null;
  }

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (!net.hosts.includes(host as never)) return null;
  if (url.pathname.replace(/\/+$/, "") === "") return null;
  url.protocol = "https:";
  url.hash = "";
  return url.href;
}

/** The networks a profile links to, in display order. */
export function socialLinksOf(socials: SocialLinks | undefined) {
  return socialNetworks.filter((n) => socials?.[n.key]).map((n) => ({ key: n.key, label: n.label, href: socials![n.key]! }));
}
