/** Atmosphere for the landing hero: organic blobs + geometric confetti. */
export function LandingDecor() {
  return (
    <div className="landing-decor" aria-hidden="true">
      <span className="landing-blob landing-blob--amber" />
      <span className="landing-blob landing-blob--coral" />
      <span className="landing-blob landing-blob--teal" />
      <span className="landing-blob landing-blob--peach" />
      <span className="landing-geo landing-geo--dots-l" />
      <span className="landing-geo landing-geo--dots-r" />
      <span className="landing-geo landing-geo--tri" />
      <span className="landing-geo landing-geo--ring" />
      <span className="landing-geo landing-geo--dot-a" />
      <span className="landing-geo landing-geo--dot-b" />
      <span className="landing-geo landing-geo--dot-c" />
    </div>
  );
}
