import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Slide to PPTX", description: "이미지를 편집 가능한 PowerPoint 슬라이드로 변환하세요." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
