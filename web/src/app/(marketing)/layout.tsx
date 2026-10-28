import { AccountNotice } from "@/components/site/AccountNotice";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import "./site.css";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <AccountNotice />
      <main id="content">{children}</main>
      <SiteFooter />
    </>
  );
}
