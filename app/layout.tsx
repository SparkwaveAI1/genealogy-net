import type { Metadata } from "next"
import "./globals.css"
import Sidebar from "./components/Sidebar"

export const metadata: Metadata = {
  title: "Genealogy Research Intelligence Platform",
  description: "AI-powered genealogical research workspace",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#F5F2ED] text-gray-900" style={{ fontSize: '13px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        <Sidebar />
        <div className="ml-[200px]">
          {children}
        </div>
      </body>
    </html>
  )
}
