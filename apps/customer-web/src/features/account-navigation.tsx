import type { MouseEvent } from 'react';

export const accountGroups = [
  {
    title: 'My Account',
    links: [
      ['profile', 'Edit profile'],
      ['addresses', 'Saved addresses'],
      ['payment-methods', 'Payment methods'],
      ['favourites', 'Favourites'],
      ['activity', 'Activity & history'],
    ],
  },
  {
    title: 'Support',
    links: [
      ['information/help', 'Help & Support'],
      ['feedback', 'Share feedback'],
    ],
  },
  {
    title: 'Preferences',
    links: [
      ['preferences', 'Language & updates'],
      ['notifications', 'Notifications'],
    ],
  },
  {
    title: 'About',
    links: [
      ['information/about', 'About Tirodhan'],
      ['information/terms', 'Terms & conditions'],
      ['information/privacy', 'Privacy policy'],
    ],
  },
] as const;

const tabs = [
  ['home', 'Home', 'M3 10l9-7 9 7v10H3z M9 20v-7h6v7'],
  ['bookings', 'Bookings', 'M4 6h16v15H4z M4 10h16 M8 3v5 M16 3v5'],
  ['pickup', 'Book Pickup', 'M12 5v14 M5 12h14'],
  ['activity', 'Activity', 'M5 3h14v18l-3-2-4 2-4-2-3 2z M8 8h8 M8 12h8'],
  [
    '',
    'Account',
    'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a8 6 0 0 1 16 0v2',
  ],
] as const;

export function followAccountLink(
  event: MouseEvent<HTMLAnchorElement>,
  navigate: (path: string) => void,
) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  navigate(event.currentTarget.pathname);
}

export function AccountNavigation({
  path,
  navigate,
}: {
  path: string;
  navigate: (path: string) => void;
}) {
  const active =
    path === '/account/home'
      ? 'home'
      : path === '/account/catalogue' ||
          path === '/account/review' ||
          path === '/account/pickup'
        ? 'pickup'
        : path === '/account/bookings' ||
            path.startsWith('/account/collections/')
          ? 'bookings'
          : path === '/account/activity'
            ? 'activity'
            : '';
  return (
    <nav className="customer-tabs" aria-label="Customer navigation">
      {tabs.map(([route, label, glyph]) => (
        <a
          key={route}
          href={route ? '/account/' + route : '/account'}
          aria-current={active === route ? 'page' : undefined}
          className={route === 'pickup' ? 'pickup-tab' : undefined}
          onClick={(event) => followAccountLink(event, navigate)}
        >
          <span aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={glyph} />
            </svg>
          </span>
          {label}
        </a>
      ))}
    </nav>
  );
}
