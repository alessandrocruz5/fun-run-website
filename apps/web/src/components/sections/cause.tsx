import { IMPACT_STATS, SITE } from "@/content/site";

export function Cause() {
  return (
    <section id="cause" className="cause" aria-labelledby="cause-title">
      <div className="wrap grid2">
        <div className="photo mono" data-reveal>
          PHOTO — Clearwater volunteers
          <br />
          at a riverbank cleanup
        </div>
        <div className="stack gap-[22px]" data-reveal data-stagger>
          <div className="mono tracking-[.06em]">
            ORGANIZED BY THE {SITE.organizer.toUpperCase()}
          </div>
          <h2 id="cause-title" className="disp">
            Every kilometer keeps a river running clean.
          </h2>
          <p>
            {SITE.organizer} is a non-profit that restores urban waterways and funds clean drinking
            water projects in communities that don&apos;t have it. 100% of race surplus — after
            permits, medals and shirts — goes straight to field work.
          </p>
          <dl className="impact">
            {IMPACT_STATS.map((stat) => (
              <div key={stat.label}>
                <dt data-count={stat.value} data-suffix={stat.suffix}>
                  {stat.value}
                  {stat.suffix}
                </dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
