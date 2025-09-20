import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";

export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="w-full max-w-screen-xl mx-auto px-0 md:px-4 py-6">
        <div className="flex xl:gap-6">
          <div className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-scroll [scrollbar-gutter:stable_both-edges] transform-gpu will-change-transform [contain:layout_paint]">
              <Sidebar />
            </div>
          </div>
          <div className="flex-1">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}