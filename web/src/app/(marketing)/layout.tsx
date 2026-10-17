// Marketing pages render full-bleed; the dashboard chrome (Nav + max-width container) lives in (dashboard).
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
