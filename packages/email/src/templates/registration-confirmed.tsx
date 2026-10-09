import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "react-email";

/**
 * Sent once, after payment, to the runner who registered. Every value arrives as a finished string
 * (the app formats prices and times exactly as the site does), so the email can't drift from the
 * success page. Table-based, inline-styled markup from React Email; the plain-text part is
 * rendered from the same tree.
 */
export type RegistrationConfirmedProps = {
  /** `Riverline Run 2027`. */
  eventName: string;
  organizer: string;
  firstName: string;
  fullName: string;
  /** `10K Run`. */
  raceLabel: string;
  /** Booking reference, `RR-7K3QX9TD`. */
  reference: string;
  /** The paid amount, `₱1,000`. */
  amount: string;
  /** `Sun · Apr 18, 2027`. */
  raceDay: string;
  venue: string;
  /** When to be at the start area, `4:30 AM`. */
  assemblyTime: string;
  /** `5:00 AM`. */
  gunTime: string;
  privacyUrl: string;
  retentionDays: number;
};

export const TEST_PAYMENT_NOTICE = "Test payment: nothing was charged";

export function registrationConfirmedSubject({
  eventName,
  raceLabel,
  reference,
}: Pick<RegistrationConfirmedProps, "eventName" | "raceLabel" | "reference">): string {
  return `You're in: ${raceLabel}, ${eventName} · ${reference} [TEST]`;
}

const NAVY = "#10233A";
const PAPER = "#F3EFE6";
const ACCENT = "#FF5A1F";
const MUTED = "#5B6B7C";
const LINE = "#D6CDB9";
const SANS = "Helvetica, Arial, sans-serif";
const MONO = "Menlo, Consolas, monospace";

const label = {
  margin: 0,
  font: `600 11px/1.4 ${MONO}`,
  letterSpacing: "0.08em",
  color: MUTED,
} as const;
const value = { margin: "4px 0 0", font: `800 18px/1.3 ${SANS}`, color: NAVY } as const;
const cell = { padding: "12px 0", borderTop: `1px solid ${LINE}`, verticalAlign: "top" } as const;

function Detail({ name, children }: { name: string; children: string }) {
  return (
    <Row>
      <Column style={cell}>
        <Text style={label}>{name}</Text>
        <Text style={value}>{children}</Text>
      </Column>
    </Row>
  );
}

export function RegistrationConfirmed(props: RegistrationConfirmedProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {`${props.raceLabel} · ${props.raceDay} · ${props.reference}. ${TEST_PAYMENT_NOTICE}.`}
      </Preview>
      <Body style={{ margin: 0, padding: "24px 8px", backgroundColor: "#E9E3D6" }}>
        <Container style={{ maxWidth: "600px", width: "100%" }}>
          <Section
            style={{
              backgroundColor: ACCENT,
              borderRadius: "14px 14px 0 0",
              padding: "8px 16px",
              textAlign: "center",
            }}
          >
            <Text style={{ margin: 0, font: `600 12px/1.4 ${MONO}`, color: NAVY }}>
              {`${TEST_PAYMENT_NOTICE.toUpperCase()} · FICTIONAL EVENT`}
            </Text>
          </Section>

          <Section style={{ backgroundColor: NAVY, padding: "28px 32px 32px" }}>
            <Text style={{ margin: 0, font: `900 16px/1 ${SANS}`, color: PAPER }}>
              {props.eventName.toUpperCase()}
            </Text>
            <Heading
              as="h1"
              style={{ margin: "28px 0 0", font: `900 40px/1.05 ${SANS}`, color: PAPER }}
            >
              {`You're in, ${props.firstName}.`}
            </Heading>
            <Text style={{ margin: "12px 0 0", font: `16px/1.5 ${SANS}`, color: "#C9D6E2" }}>
              {`Your ${props.raceLabel} entry is paid and recorded. See you at the ${props.venue}.`}
            </Text>
          </Section>

          <Section style={{ backgroundColor: PAPER, padding: "24px 32px 8px" }}>
            <Detail name="RUNNER">{props.fullName}</Detail>
            <Detail name="RACE">{props.raceLabel}</Detail>
            <Detail name="REFERENCE">{props.reference}</Detail>
            <Detail name="PAID (TEST)">{`${props.amount} · ${TEST_PAYMENT_NOTICE.toLowerCase()}`}</Detail>
          </Section>

          <Section style={{ backgroundColor: PAPER, padding: "16px 32px 8px" }}>
            <Text style={{ ...label, color: NAVY }}>RACE DAY</Text>
            <Detail name="DATE">{props.raceDay}</Detail>
            <Detail name="VENUE">{props.venue}</Detail>
            <Detail name="ASSEMBLY">{`${props.assemblyTime} at the start area`}</Detail>
            <Detail name="GUN TIME">{props.gunTime}</Detail>
          </Section>

          <Section style={{ backgroundColor: PAPER, padding: "16px 32px 28px" }}>
            <Text style={{ margin: 0, font: `14px/1.5 ${SANS}`, color: NAVY }}>
              Keep your reference handy: it is how the organizers find your entry.
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: NAVY,
              borderRadius: "0 0 14px 14px",
              padding: "20px 32px",
            }}
          >
            <Text style={{ margin: 0, font: `12px/1.6 ${MONO}`, color: "#9FB0C2" }}>
              {`${props.eventName} is a fictional event by the fictional ${props.organizer}, a portfolio project. ${TEST_PAYMENT_NOTICE}, and no real race takes place.`}
            </Text>
            <Text style={{ margin: "8px 0 0", font: `12px/1.6 ${MONO}`, color: "#9FB0C2" }}>
              {`You get this one email because you registered. Your registration is deleted within ${props.retentionDays} days. `}
              <Link href={props.privacyUrl} style={{ color: "#9CC8D9" }}>
                Privacy notice
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
