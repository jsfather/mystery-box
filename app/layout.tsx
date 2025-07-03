import '@/app/globals.css';
import { jersey10 } from '@/app/fonts';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jersey10.variable} antialiased`}>{children}</body>
    </html>
  );
}
