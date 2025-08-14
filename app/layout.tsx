import './globals.css'
import type { Metadata } from 'next'
import { Inter, Roboto_Mono } from "next/font/google";
import { Providers } from './providers'
// Header and Footer removed for fullscreen Studio experience
// import Header from "./components/header/Header";
// import Footer from "./components/footer/Footer";
// import { Toaster } from 'react-hot-toast';

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'ClipJS',
  description: 'A free online video editor that enables you to edit videos directly from your web browser.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        className={`min-h-screen flex flex-col bg-darkSurfacePrimary text-white dark:bg-darkSurfacePrimary dark:text-white font-sans ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {/* Header and Footer removed - Studio is now fullscreen */}
          <main className="flex-grow">
            {/* <Toaster toastOptions={{
              style: {
                borderRadius: '10px',
                background: '#333',
                color: '#fff',
              },
            }} /> */}
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
