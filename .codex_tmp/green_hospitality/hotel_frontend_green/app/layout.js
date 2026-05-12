
import './globals.css'

export const metadata = {
  title: 'Hospitality Management System',
  description: 'Luxury Hotel ERP Dashboard'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
