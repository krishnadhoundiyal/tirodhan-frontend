import type { ReactNode } from 'react';

export const pages = {
  '/': {
    title: 'Respectful collection of sacred items',
    description:
      'A thoughtful onward journey for broken, damaged or no-longer-required idols and sacred material. Learn about Tirodhan and collection availability.',
  },
  '/how-it-works': {
    title: 'How collection works',
    description:
      'Understand the Tirodhan journey: eligible items, a serviceable address, collection options and authorized handover.',
  },
  '/what-we-collect': {
    title: 'What can be collected',
    description:
      'Explore the sacred material groups that guide Tirodhan’s collection experience, with eligibility and availability subject to confirmation.',
  },
  '/availability': {
    title: 'Service availability',
    description:
      'Learn how address-specific availability is checked. Online booking is not yet activated on Customer Web.',
  },
  '/help': {
    title: 'Help and questions',
    description:
      'Answers about respectful collection, service areas, addresses and the current availability of online booking.',
  },
  '/about': {
    title: 'About Tirodhan',
    description:
      'Tirodhan begins with respectful household collection of sacred items and appropriate authorized handover.',
  },
  '/policies': {
    title: 'Policies and legal information',
    description:
      'Publication status of Tirodhan Customer Web privacy and service policies.',
  },
  '/policies/privacy': {
    title: 'Privacy policy — publication pending',
    description:
      'The approved Customer Web privacy policy is not yet published.',
  },
  '/policies/terms': {
    title: 'Service terms — publication pending',
    description: 'Approved Customer Web service terms are not yet published.',
  },
} as const;
export const publicPaths = Object.keys(pages);
export const accountPaths = [
  '/account',
  '/account/addresses',
  '/account/serviceability',
  '/account/activity',
];
export function normalizePath(path: string) {
  return path === '/' ? path : path.replace(/\/+$/, '');
}
export function metadata(path: string) {
  const page = pages[path as keyof typeof pages];
  return {
    title: `${page?.title ?? (accountPaths.includes(path) ? 'Your account' : 'Page not found')} | Tirodhan`,
    description:
      page?.description ?? 'Customer account access is not yet activated.',
    noindex: !page || path.startsWith('/policies'),
  };
}
export function Lotus({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 80"
      fill="none"
      aria-hidden="true"
    >
      <path d="M50 65C25 56 23 32 50 9c27 23 25 47 0 56Z" />
      <path d="M50 65C23 70 10 50 9 31c24 0 40 12 41 34ZM50 65c27 5 40-15 41-34-24 0-40 12-41 34ZM20 70h60" />
    </svg>
  );
}
export function Header({ path }: { path: string }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Tirodhan home">
        <Lotus />
        <span>
          Tirodhan<span className="wordmark-note">WITH REVERENCE, ALWAYS</span>
        </span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        {[
          ['/how-it-works', 'How it works'],
          ['/what-we-collect', 'What we collect'],
          ['/about', 'Our purpose'],
          ['/help', 'Help'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={path === href ? 'page' : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <a className="button small header-cta" href="/availability">
        Explore collection <span aria-hidden="true">↗</span>
      </a>
      <details className="mobile-menu">
        <summary>Menu</summary>
        <nav aria-label="Mobile navigation">
          <a href="/how-it-works">How it works</a>
          <a href="/what-we-collect">What we collect</a>
          <a href="/about">Our purpose</a>
          <a href="/help">Help</a>
          <a href="/availability">Explore collection</a>
        </nav>
      </details>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="footer-brand" href="/">
          Tirodhan
        </a>
        <p lang="hi" className="hindi">
          श्रद्धा से संग्रह / सम्मान से प्रस्थान
        </p>
        <p className="fine">A thoughtful onward journey for sacred things.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="/how-it-works">How it works</a>
        <a href="/what-we-collect">Collection groups</a>
        <a href="/availability">Availability</a>
        <a href="/help">Help & FAQ</a>
        <a href="/policies">Policies & publication status</a>
        <a href="/account">Customer account</a>
      </nav>
      <p className="footer-bottom">
        Respectful collection. Appropriate authorized handover.
        <br />
        Online booking is not yet activated on Customer Web.
      </p>
    </footer>
  );
}
export function Gate() {
  return (
    <section className="notice">
      <span className="eyebrow">CUSTOMER WEB · ACTIVATION PENDING</span>
      <h2>Online booking is not yet activated.</h2>
      <p>
        Secure customer sign-in and address checks are not yet available. We
        cannot confirm coverage, a collection time or a price here yet.
      </p>
      <a className="text-link" href="/how-it-works">
        Understand the collection journey <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}
function HeroArt() {
  return (
    <div className="hero-art">
      <div className="art-disc" />
      <svg
        className="offering"
        viewBox="0 0 480 500"
        role="img"
        aria-labelledby="offering-title"
      >
        <title id="offering-title">
          Original line illustration of a flower resting above a collection
          bowl, framed by an arch
        </title>
        <defs>
          <linearGradient id="bowl" x2="0" y2="1">
            <stop stopColor="#e5cb9f" />
            <stop offset="1" stopColor="#b78544" />
          </linearGradient>
        </defs>
        <path
          d="M85 408V224a155 155 0 0 1 310 0v184"
          fill="none"
          stroke="#c6ad86"
        />
        <path
          d="M104 401V224a136 136 0 0 1 272 0v177"
          fill="none"
          stroke="#ded0ba"
        />
        <ellipse
          cx="240"
          cy="426"
          rx="151"
          ry="15"
          fill="#d8c5a5"
          opacity=".35"
        />
        <path
          d="M113 345h254c-9 62-58 90-127 90s-118-28-127-90"
          fill="url(#bowl)"
        />
        <ellipse
          cx="240"
          cy="345"
          rx="127"
          ry="18"
          fill="#edddbf"
          stroke="#ab7b3f"
        />
        <g fill="#f8f0df" stroke="#a7753d" strokeWidth="1.8">
          <path d="M240 329c-62-35-61-82 0-135 61 53 62 100 0 135Z" />
          <path d="M240 329c-69 10-100-37-104-83 58 3 99 37 104 83ZM240 329c69 10 100-37 104-83-58 3-99 37-104 83Z" />
          <path d="M240 329c-64 28-116 1-138-37 55-17 109-2 138 37ZM240 329c64 28 116 1 138-37-55-17-109-2-138 37Z" />
        </g>
        <path d="M216 384h48M224 397h32" stroke="#785429" opacity=".6" />
        <circle cx="240" cy="132" r="3" fill="#b98b50" />
        <path d="M240 111v-8M219 132h-8M261 132h8" stroke="#b98b50" />
      </svg>
      <p className="art-caption">
        Held with care.
        <br />
        <em>Sent onward with respect.</em>
      </p>
    </div>
  );
}
const steps = [
  [
    '01',
    'Begin with your items',
    'Review the collection groups and identify the sacred items you would like collected.',
  ],
  [
    '02',
    'Check your address',
    'Serviceability is specific to your address and must be confirmed by Tirodhan.',
  ],
  [
    '03',
    'Review collection options',
    'When booking is enabled, review available options and any applicable payment before confirming.',
  ],
  [
    '04',
    'Collection & handover',
    'The journey continues with household collection and appropriate authorized receiving-point handover.',
  ],
];
export const groups = [
  [
    'Floral & Organic',
    'Used flowers and garlands, havan and puja remnants, sacred leaves and organic offerings.',
  ],
  [
    'Sacred Objects',
    'Broken or retired idols and sacred figures, frames, yantras and temple decoration material.',
  ],
  [
    'Texts & Paper',
    'Old holy books, sacred paper, mantras, calendars and damaged pages.',
  ],
  [
    'Vastra & Accessories',
    'Idol clothes, sacred fabrics, ornaments, altar cloth and covers.',
  ],
];
function Steps() {
  return (
    <ol className="journey">
      {steps.map(([n, title, body]) => (
        <li key={n}>
          <span className="step-number">{n}</span>
          <h3>{title}</h3>
          <p>{body}</p>
        </li>
      ))}
    </ol>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="gold-line" />A RESPECTFUL ONWARD JOURNEY
          </p>
          <h1>
            Some things deserve
            <br />a thoughtful
            <br />
            <em>farewell.</em>
          </h1>
          <p className="hero-intro">
            For sacred items that have been part of your home and your devotion.
            Tirodhan begins with respectful collection of broken, damaged or
            no-longer-required idols and sacred material.
          </p>
          <div className="actions">
            <a href="/availability" className="button">
              Explore collection <span aria-hidden="true">→</span>
            </a>
            <a href="/how-it-works" className="text-link">
              How it works
            </a>
          </div>
          <p lang="hi" className="hindi hero-hindi">
            श्रद्धा से संग्रह / सम्मान से प्रस्थान
          </p>
        </div>
        <HeroArt />
      </section>
      <div className="principles">
        <span>Respect for what matters</span>
        <span>Care at every step</span>
        <span>Clarity before commitment</span>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE COLLECTION JOURNEY</p>
            <h2>
              A considered next step,
              <br />
              from your home onward.
            </h2>
          </div>
          <a className="text-link" href="/how-it-works">
            See the journey <span aria-hidden="true">↗</span>
          </a>
        </div>
        <Steps />
      </section>
      <section className="collection-band">
        <div>
          <p className="eyebrow">SACRED ITEMS, THOUGHTFULLY GROUPED</p>
          <h2>
            Different forms.
            <br />
            <em>The same respect.</em>
          </h2>
          <p>
            Explore the groups that guide our collection experience. Item
            eligibility and service availability need confirmation.
          </p>
          <a className="text-link" href="/what-we-collect">
            Explore collection groups <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="group-grid">
          {groups.map(([title, body], i) => (
            <a className="group-tile" href="/what-we-collect" key={title}>
              <span aria-hidden="true">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className="tile-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </div>
      </section>
      <section className="section closing">
        <Lotus />
        <p className="eyebrow">WITH REVERENCE, ALWAYS</p>
        <h2>
          A little care for things
          <br />
          that have meant so much.
        </h2>
        <p>
          Begin by understanding the journey. Online booking is not yet
          activated. Secure sign-in, address checks and collection options are
          not available here yet.
        </p>
        <a className="button" href="/availability">
          View service availability <span aria-hidden="true">→</span>
        </a>
      </section>
    </>
  );
}
const faq = [
  [
    'Can I book a collection on this website?',
    'Online booking is not yet activated on Customer Web. You can explore the collection journey and understand how address-specific availability will be checked.',
  ],
  [
    'Is collection available everywhere?',
    'No universal coverage is promised. Serviceability must be checked for the specific customer address. A serviceable address does not confirm a collection slot or a collection time.',
  ],
  [
    'What happens after collection?',
    'The service journey is household collection followed by appropriate authorized receiving-point handover. We do not promise a particular receiving point, restoration, recycling, immersion or downstream disposal processing here.',
  ],
  [
    'How much does collection cost?',
    'There is no fixed public price in this foundation. When booking becomes available, the backend-generated quotation and applicable collection options must be reviewed before confirmation.',
  ],
  [
    'Do I need to share my live location?',
    'Manual address entry remains available. This foundation does not request browser location access.',
  ],
  [
    'Can I see previous bookings here?',
    'Booking history is not yet available on Customer Web. No booking history can be viewed here yet.',
  ],
];
function Intro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="lead">{children}</div>
    </div>
  );
}
export function PublicPage({ path }: { path: string }) {
  let content: ReactNode;
  if (path === '/') content = <Home />;
  else if (path === '/how-it-works')
    content = (
      <>
        <Intro eyebrow="THE JOURNEY" title="Care, from your home onward.">
          <p>
            Collection begins with clear information and a serviceable address.
            Every next step needs its own confirmation.
          </p>
        </Intro>
        <Steps />
        <section className="notice">
          <h2>Know the boundaries.</h2>
          <p>
            Serviceability is not a slot reservation. Collection times, prices,
            eligible items and receiving-point arrangements are subject to the
            applicable confirmed service. We make no universal coverage or
            downstream processing promise.
          </p>
          <a className="button" href="/availability">
            Check the current availability boundary →
          </a>
        </section>
      </>
    );
  else if (path === '/what-we-collect')
    content = (
      <>
        <Intro
          eyebrow="COLLECTION GROUPS"
          title="Sacred things, in many forms."
        >
          <p>
            These approved design groupings explain the intended collection
            experience. They are an editorial guide, not a live catalogue or a
            confirmation that an item can be collected.
          </p>
        </Intro>
        <div className="editorial-groups">
          {groups.map(([title, body], i) => (
            <section key={title}>
              <span className="step-number">0{i + 1}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <div className="notice">
          <h2>Eligibility comes before confirmation.</h2>
          <p>
            The operational catalogue must come from the backend.
            Region-specific item eligibility, handling and collection options
            are not yet available on this website.
          </p>
          <a href="/availability" className="text-link">
            Explore availability →
          </a>
        </div>
      </>
    );
  else if (path === '/availability')
    content = (
      <>
        <Intro
          eyebrow="SERVICE AVAILABILITY"
          title="Start with the place you call home."
        >
          <p>
            Coverage is address-specific. An address check needs a verified
            customer session and a current address snapshot.
          </p>
        </Intro>
        <Gate />
        <section className="section compact">
          <h2>What an availability check means</h2>
          <p>
            A backend-confirmed serviceable address can support the next step of
            the journey. It does not confirm a collection slot, price, receiving
            point or pickup time.
          </p>
          <p>
            You can enter your address manually when secure customer access is
            activated.
          </p>
          <a className="text-link" href="/account/serviceability">
            View customer access status →
          </a>
        </section>
      </>
    );
  else if (path === '/help')
    content = (
      <>
        <Intro eyebrow="HELP & FAQ" title="A little clarity, before you begin.">
          <p>
            Honest answers about the collection journey and what is available on
            Customer Web today.
          </p>
        </Intro>
        <div className="faq">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <section className="notice">
          <h2>Direct support details are awaiting publication.</h2>
          <p>
            A verified support contact has not been approved for this website.
            We will not publish an unverified number or ask you to send
            household details through an unofficial channel.
          </p>
        </section>
      </>
    );
  else if (path === '/about')
    content = (
      <>
        <Intro eyebrow="OUR PURPOSE" title="Respect does not end with use.">
          <p>
            Some things hold a significance that outlasts their place in our
            homes. Tirodhan begins with a simple service: respectful household
            collection of damaged, broken or no-longer-required idols and sacred
            material.
          </p>
        </Intro>
        <section className="about-statement">
          <Lotus />
          <h2 lang="hi" className="hindi">
            श्रद्धा से संग्रह
            <br />
            सम्मान से प्रस्थान
          </h2>
          <p>
            Our customer journey is being built around clarity, care and
            appropriate authorized receiving-point handover. This website
            describes that scope without promising services or endorsements that
            have not been established.
          </p>
        </section>
        <section className="notice">
          <h2>One clear service to begin with.</h2>
          <p>
            Restoration, recycling, immersion, disposal processing and future
            cow or farm services are not current offerings on this website.
          </p>
          <a href="/how-it-works" className="text-link">
            Understand the collection journey →
          </a>
        </section>
      </>
    );
  else if (path.startsWith('/policies'))
    content = (
      <>
        <Intro
          eyebrow="PUBLISHING BOUNDARY"
          title={
            path === '/policies/privacy'
              ? 'Privacy policy awaiting approval.'
              : path === '/policies/terms'
                ? 'Service terms awaiting approval.'
                : 'Policies, with a clear publication status.'
          }
        >
          <p>
            Approved legal text for Customer Web has not been supplied. The
            statements on this page are publication notices and do not
            substitute for a privacy policy or service terms.
          </p>
        </Intro>
        <div className="policy-links">
          <a href="/policies/privacy">
            Privacy policy <span>Not published →</span>
          </a>
          <a href="/policies/terms">
            Service terms <span>Not published →</span>
          </a>
        </div>
        <Gate />
      </>
    );
  else if (accountPaths.includes(path))
    content = (
      <>
        <Intro eyebrow="YOUR CUSTOMER ACCOUNT" title="A secure beginning.">
          <p>
            Your account will bring addresses and address-specific availability
            together.
          </p>
        </Intro>
        <Gate />
        <noscript>
          JavaScript is required for the customer application when secure access
          is activated. Public information remains available without JavaScript.
        </noscript>
      </>
    );
  else
    content = (
      <Intro eyebrow="PAGE NOT FOUND" title="Let’s find your way back.">
        <p>
          This page is unavailable. <a href="/">Return to Tirodhan home</a>.
        </p>
      </Intro>
    );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header path={path} />
      <main
        id="main"
        tabIndex={-1}
        className={path === '/' ? '' : 'inner-page'}
      >
        {content}
      </main>
      <Footer />
    </>
  );
}
