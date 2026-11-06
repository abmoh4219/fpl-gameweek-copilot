import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { repoStars } from "@/lib/github";
import "./site.css";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const stars = await repoStars();
  return (
    <>
      <SiteHeader stars={stars} />
      <main id="content">{children}</main>
      <SiteFooter />
    </>
  );
}
