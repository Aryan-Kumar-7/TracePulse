import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TracePulse — Distributed Telemetry & AI Incident RCA',
  description: 'OpenTelemetry-compliant real-time distributed tracing and automated incident root-cause diagnosis.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-gray-100 antialiased selection:bg-blue-500/30">
        {children}
      </body>
    </html>
  );
}
