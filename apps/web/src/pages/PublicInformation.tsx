import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './PublicInformation.css';

function PublicInformation({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="public-information">
      <nav aria-label="Public information">
        <Link to="/welcome">Back to Lacuna</Link>
        <div>
          <Link to="/privacy" aria-current={title === 'Privacy' ? 'page' : undefined}>
            Privacy
          </Link>
          <Link to="/terms" aria-current={title === 'Terms' ? 'page' : undefined}>
            Terms
          </Link>
        </div>
      </nav>
      <main>
        <header>
          <p className="public-information-kicker">Before you start</p>
          <h1>{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

export function Privacy() {
  return (
    <PublicInformation title="Privacy">
      <p className="public-information-intro">
        Lacuna is local-first. Studying needs no account, but some website services and optional
        features send information beyond your device. Here is what that means in practice.
      </p>
      <section>
        <h2>Study data on your device</h2>
        <p>
          Courses, cards, answers and study progress are stored in your device’s IndexedDB database.
          Preferences and connection details also use local browser storage. The desktop app keeps
          its own local profile, separate from your browser.
        </p>
        <p>
          Clearing site data, a browser clearing storage or losing your device can remove local
          work. Settings offers backups you can export and restore. Local restore points share the
          same storage risk; keep an exported backup somewhere you can recover it.
        </p>
      </section>
      <section>
        <h2>Optional sync and sharing</h2>
        <p>
          Device sync uploads an encrypted study snapshot to a relay after you set it up. Paired
          devices hold the keys to read it. Encryption protects the content, not network details
          such as your IP address, request times or the size of an upload.
        </p>
        <p>
          Publishing a course link is different: it uploads the course to the relay so anyone with
          the link or code can import it. It is not private encrypted device sync. Removing a
          published link stops future downloads from that link; it cannot remove copies others have
          already imported. Exported files can also be copied by their recipients.
        </p>
        <p>
          Where Gaps class reporting is available, sharing insights with a teacher requires a
          separate choice for that course on that device. Reports can include your chosen name or
          class identifier, questions, answers, marks and study activity. Reports are encrypted for
          the teacher, who can read and retain them. Turning reporting off stops future sends. Read
          the{' '}
          <a href="https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md">
            Gaps school data notice
          </a>{' '}
          for report contents, retention and deletion limits.
        </p>
      </section>
      <section>
        <h2>Website analytics and hosting</h2>
        <p>
          The production getlacuna.app website loads Simple Analytics to measure visits. Its
          documentation describes page views, referral sources and device/browser information,
          without analytics cookies or stored IP addresses. This is separate from your study
          database. Read{' '}
          <a href="https://docs.simpleanalytics.com/what-we-collect">
            Simple Analytics data collection
          </a>
          .
        </p>
        <p>
          Web builds deployed on Vercel also enable Vercel Web Analytics in the application. It
          measures page views and visit information such as referrers, browser, device and
          approximate location. See{' '}
          <a href="https://vercel.com/docs/analytics/privacy-policy">
            Vercel Web Analytics privacy information
          </a>
          .
        </p>
        <p>
          The website and hosted services run on Vercel. Serving pages, relay requests and
          demonstration films involves network information such as IP addresses and request
          metadata. Playing embedded YouTube or Vimeo material connects to those services. Following
          external links connects to the destination’s service and its own data practices.
        </p>
      </section>
      <section>
        <h2>Optional Jev assistance</h2>
        <p>
          Jev is off by default. When you enable it, Lacuna’s hosted service sends relevant study
          text to TypeSafe AI in the United States. That includes questions, answers and mark
          schemes for marking, lesson questions and candidate answers for multiple choice, and
          authored marking points and technique descriptions for classification. Keep personal data
          out of material you use with Jev.
        </p>
        <p>
          Lacuna’s TypeSafe organisation has zero data retention enabled for request content.
          TypeSafe says it does not train Jev on submissions. Its{' '}
          <a href="https://help.typesafe.ai/articles/5974925716-how-is-submitted-data-used-or-retained">
            data handling information
          </a>{' '}
          explains processing and operational telemetry. Lacuna uses a hashed installation ID and
          usage counters in Upstash Redis to enforce request limits. Cached judgements and lesson
          shortlists are stored on the device. Turning Jev off stops new requests.
        </p>
      </section>
      <section>
        <h2>Connections you choose</h2>
        <p>
          Choosing Send feedback in Settings or Help loads an external Tally form. Opening it
          connects to Tally; information you submit is sent to Tally for the form owner to read.
          Lacuna does not attach your study data, page URL or referrer. The form cannot read your
          local Lacuna database.
        </p>
        <p>
          If you configure MCP access for an external AI client, that client can receive the Lacuna
          data exposed by the tools you authorise. Its provider’s data practices apply to anything
          it receives. Keep access codes, sync keys and teacher connection files private.
        </p>
      </section>
    </PublicInformation>
  );
}

export function Terms() {
  return (
    <PublicInformation title="Terms">
      <p className="public-information-intro">
        Product information and the software licence. This page does not add a separate service
        contract.
      </p>
      <section>
        <h2>Free and open source</h2>
        <p>
          Lacuna is free and open source, with no subscription. You can study without creating an
          account. Optional hosted features depend on network access and service availability.
        </p>
      </section>
      <section>
        <h2>The software licence</h2>
        <p>
          Lacuna’s source code is published under the{' '}
          <a href="https://github.com/TJ7755/Lacuna/blob/master/LICENSE">MIT licence</a>. The full
          licence sets out permissions to use, copy, modify and distribute the software, the
          copyright and permission notice requirements, and its warranty and liability wording. This
          software licence does not grant rights to other people’s course material.
        </p>
      </section>
      <section>
        <h2>Your material and backups</h2>
        <p>
          Importing or publishing material can create copies on other devices. Check that you have
          permission to share the content you publish. Keep recoverable backups of important work;
          local storage and local restore points can be lost together.
        </p>
      </section>
      <section>
        <h2>Optional services</h2>
        <p>
          Sync, course links, class reporting, embedded media and automatic marking have different
          data flows. The <Link to="/privacy">Privacy information</Link> explains these before you
          choose them. External services have their own terms and policies. Automatic marks can be
          wrong; you can review and change them.
        </p>
      </section>
    </PublicInformation>
  );
}
