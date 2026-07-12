import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { fetchRows, fetchKpis } from "@/lib/data";
import { listConfirmations } from "@/lib/confirm/store";

async function getNavBadges() {
  try {
    const [{ kpis }, payments, awaiting] = await Promise.all([
      fetchKpis(),
      fetchRows("payments", { where: { status: "needs_verification" } }),
      listConfirmations({ status: "awaiting" }).catch(() => []),
    ]);
    return {
      inbox: kpis.hotLeads,
      payments: payments.rows.length,
      disputes: kpis.openDisputes,
      confirmations: awaiting.length,
      attention: kpis.hotLeads + payments.rows.length + kpis.openDisputes,
    };
  } catch {
    return { inbox: 0, payments: 0, disputes: 0, attention: 0, confirmations: 0 };
  }
}

export const metadata: Metadata = {
  title: {
    default: "Beyond Style UAE — Order Control Console",
    template: "%s · Beyond Style UAE",
  },
  description: "UAE social-commerce sales operating console — AI drafts, owner approves. Conversion, payment, delivery and margin in one tower.",
  applicationName: "Beyond Style UAE",
  authors: [{ name: "Beyond Connect General Trading L.L.C." }],
  keywords: ["Beyond Style UAE", "social commerce", "UAE", "AI sales", "order control"],
  openGraph: {
    title: "Beyond Style UAE — Order Control Console",
    description: "AI drafts, owner approves. Track every lead, payment, delivery and review in one place.",
    type: "website",
    locale: "en_AE",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false, follow: false }, // internal ops tool
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f3" },
    { media: "(prefers-color-scheme: dark)",  color: "#1c1917" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const badges = await getNavBadges();
  return (
    <html lang="en" dir="ltr">
      <body>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-[color:rgb(var(--hairline))] bg-white/70 backdrop-blur-xl md:block">
            <Nav badges={badges} />
          </aside>
          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
              <div className="mb-3 md:hidden">
                <Nav mobile badges={badges} />
              </div>
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
