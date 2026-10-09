import { ButtonLink } from "@rr/ui";

export default function NotFound() {
  return (
    <main className="wrap prose">
      <p className="mono">404 · OFF COURSE</p>
      <h1 className="disp">This path isn&apos;t on the route.</h1>
      <p>The page you were looking for doesn&apos;t exist. Head back to the start line.</p>
      <div className="row">
        <ButtonLink href="/" variant="accent">
          BACK TO THE START
        </ButtonLink>
      </div>
    </main>
  );
}
