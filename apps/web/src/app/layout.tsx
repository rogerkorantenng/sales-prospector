import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Brownshift Prospector",
  description: "Sales intelligence and cold outreach tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="relative h-full flex bg-[#f0f2f5] text-[#344767] overflow-hidden">
        <Sidebar />
        <main className="relative z-[1] flex-1 h-screen overflow-y-auto p-6">
          {children}
        </main>
        <Toaster
          theme="light"
          toastOptions={{
            style: {
              background: "#ffffff",
              border: "1px solid #e9ecef",
              color: "#344767",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            },
          }}
        />
      </body>
    </html>
  );
}
