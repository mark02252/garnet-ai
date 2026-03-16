type PageSectionTab = {
  label: string;
  href: string;
};

export function PageSectionTabs({ items }: { items: PageSectionTab[] }) {
  return (
    <nav className="page-section-tabs" aria-label="페이지 섹션 바로가기">
      {items.map((item) => (
        <a key={item.href} href={item.href} className="page-section-tab">
          {item.label}
        </a>
      ))}
    </nav>
  );
}
