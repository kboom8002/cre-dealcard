'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/broker', icon: '🏠', label: '홈', id: 'nav-home' },
  { href: '/broker/clients', icon: '👥', label: '고객', id: 'nav-clients' },
  { href: '/broker/buildings', icon: '🏢', label: '매물', id: 'nav-buildings' },
  { href: '/broker/matching', icon: '🎯', label: '매칭', id: 'nav-matching' },
  { href: '/broker/pipeline', icon: '📊', label: '파이프', id: 'nav-pipeline' },
] as const;

export default function BrokerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border"
      id="broker-bottom-nav"
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/broker'
              ? pathname === '/broker'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              id={item.id}
            >
              <span className={`text-lg transition-transform ${isActive ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute -top-0.5 w-6 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
