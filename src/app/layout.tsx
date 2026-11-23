import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SurveyProvider } from "@/components/feedback/SurveyProvider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import "./globals.css";

const notoKr = localFont({
  src: [
    { path: "../../public/fonts/NotoSansKR-Regular.woff", weight: "400", style: "normal" },
    { path: "../../public/fonts/NotoSansKR-Bold.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-noto-kr",
  display: "swap",
  preload: true,
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = getCanonicalSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "크리딜 (CREDEAL) | 상업용 부동산 중개사 AI 워크스페이스",
    template: "%s | 크리딜 (CREDEAL)",
  },
  description:
    "매물 딜카드, 10섹션 모바일/PPTX IM, 주간/월간 빌딩 뉴스레터, 고객 소통함까지 하나로 연결된 상업용 부동산 중개사 전용 워크스페이스.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const FONT_SCALE_INIT_SCRIPT = `(function(){try{var k1='credeal-workspace-font-scale-v1',k2='cre-font-scale';var v=localStorage.getItem(k1)||localStorage.getItem(k2);if(v==='compact'||v==='normal'||v==='large'||v==='xlarge'){document.documentElement.dataset.fontScale=v;localStorage.setItem(k1,v);localStorage.setItem(k2,v);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      data-font-scale="normal"
      className={`${notoKr.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FONT_SCALE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          <ToastProvider />
          <SurveyProvider>
            {children}
          </SurveyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
