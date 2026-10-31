import { getHeroData, getHeroSettings } from "@/lib/banner";
import type { Activity } from "@/lib/facility";
import type { PublicOwner } from "@/lib/owners";
import HeroView from "./hero-view";

/** Business page banner, in the template and style the owner picked at /app/banner. */
export default async function Hero({ owner, activities }: { owner: PublicOwner; activities: Activity[] }) {
  const [settings, data] = await Promise.all([getHeroSettings(owner.id), getHeroData(owner, activities)]);
  return <HeroView settings={settings} data={data} />;
}
